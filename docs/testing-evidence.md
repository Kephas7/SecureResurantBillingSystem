# Manual Testing Evidence
## Secure Restaurant Billing & Management System
### ST6005CEM Security — Coursework 2

**Testing approach:** White-box manual testing against the live application stack (Docker Compose: NestJS API + Next.js frontend + PostgreSQL + Redis). All tests performed directly against the API via curl, bypassing the frontend to confirm server-side enforcement — the frontend cannot be relied upon as a security boundary, so every control below is verified at the layer that actually enforces it.

**Environment:** API `http://localhost:4000`, Web `http://localhost:3000`, full `docker compose up --build` stack.

---

## 1. Authentication Controls

### 1.1 Password policy enforcement

**Test:** Attempt registration with a password that violates policy (too short, missing complexity).
**Endpoint:** `POST /auth/register`

```
$ curl -b admin-session.txt -X POST http://localhost:4000/auth/register \
    -d '{"email":"test@restaurant.local","password":"short","fullName":"Test","roleName":"WAITER"}'

{"statusCode":400,"message":["password must contain an uppercase letter, a lowercase letter, a digit, and a special character","password must be longer than or equal to 12 characters"],"timestamp":"..."}
```

**Result: PASS.** `RegisterDto`'s `class-validator` decorators (`@MinLength(12)`, `@Matches(...)`) reject the weak password with both violated rules listed, before the service layer or database is ever reached.

**Note:** `POST /auth/login` deliberately does *not* apply this validation to its password field (only `@IsString`, `@IsNotEmpty`, `@MaxLength(72)`) — this is an intentional design decision, not an oversight: rejecting a login attempt with a "password too short" message before checking credentials would let an attacker distinguish malformed guesses from real ones. Login treats every submitted password identically regardless of shape.

### 1.2 Argon2id password hashing

**Test:** Confirm passwords are never stored in plaintext or with a weaker hash algorithm.
**Evidence:** Direct database inspection of the live `User` table.

```
$ docker exec <postgres-container> psql -U restaurant_app -d restaurant_secure \
    -c "SELECT LEFT(\"passwordHash\", 10) FROM \"User\" LIMIT 3;"

 $argon2id$
 $argon2id$
 $argon2id$
```

**Result: CONFIRMED.** Every stored hash uses the `$argon2id$` prefix (Argon2id, the OWASP-recommended variant balancing GPU/side-channel resistance), consistent with the `argon2` package's `hash()` call in `auth.service.ts`. No plaintext or legacy-hash (MD5/SHA1/bcrypt) values are present.

### 1.3 Account lockout

**Test:** Submit consecutive failed login attempts for the same account.
**Endpoint:** `POST /auth/login`

```
attempt 1: {"statusCode":401,"message":"Invalid email or password", ...}
attempt 2: {"statusCode":401,"message":"Invalid email or password", ...}
attempt 3: {"statusCode":401,"message":"Invalid email or password", ...}
attempt 4: {"statusCode":401,"message":"Invalid email or password", ...}
attempt 5: {"statusCode":401,"message":"Invalid email or password", ...}
attempt 6: {"statusCode":401,"message":"Invalid credentials or account temporarily locked. If you have an account, try again in 15 minute(s).", ...}
```

**Result: PASS.** The account locks after 5 failed attempts (the 6th request is rejected). The lockout response returns `401` (not a distinct `403`) — this is the *remediated* behavior from FINDING-003: the status code was deliberately normalized to match the generic invalid-credentials response so that a locked real account and a non-existent account can no longer be distinguished by status code alone (see `docs/pentest/findings.md` FINDING-003 for the full before/after and the residual message-body caveat). The account was unlocked via `POST /users/:id/unlock` (admin) after the test to restore clean state.

### 1.4 Session fixation prevention

**Test:** Check whether a session cookie is issued before authentication, and whether repeated logins reuse a fixed session ID.

```
$ curl -i http://localhost:4000/auth/me          # no cookie sent
HTTP/1.1 401 Unauthorized                        # no Set-Cookie header at all

$ curl -i -X POST http://localhost:4000/auth/login -d '{...valid credentials...}'
HTTP/1.1 200 OK
Set-Cookie: sid=<session-id>; Path=/; HttpOnly; SameSite=Lax
```

Two independent logins for the same account were also compared (session cookie values hashed for comparison, not disclosed in this report):

```
login 1 -> Set-Cookie hash: e2a20bd3a51971adf0cb286774be0dbc
login 2 -> Set-Cookie hash: 03874b8082395ef3c325d99e9adb1628   (different)
```

**Result: PASS.** No session is created (`saveUninitialized: false`) until a successful login writes to `req.session`, so there is no pre-authentication cookie for an attacker to "fix" onto a victim in the first place. Each login additionally issues a distinct session ID, confirming no fixed/reused identifier across sessions.

### 1.5 Session invalidation on logout

**Test:** Capture a session cookie, log out, attempt to reuse the cookie.
**Endpoint:** `POST /auth/logout`

```
$ curl -b session.txt -X POST http://localhost:4000/auth/logout
{"message":"Logged out successfully"}                              HTTP:200

$ curl -b session.txt http://localhost:4000/auth/me                # same cookie, reused
{"statusCode":401,"message":"Authentication required", ...}         HTTP:401
```

**Result: PASS.** `req.session.destroy()` correctly invalidates the Redis-backed session server-side; the cookie is not merely cleared client-side.

### 1.6 MFA flow

**Test:** Enable MFA on an account, log out, log back in.
**Endpoints:** `POST /auth/mfa/setup`, `POST /auth/mfa/verify-setup`, `POST /auth/login`, `POST /auth/mfa/verify`

1. `POST /auth/mfa/setup` → returns an `otpauth://` URL for QR-code enrollment (raw secret never sent as a separate plaintext field).
2. A valid TOTP code from that secret submitted to `POST /auth/mfa/verify-setup` → `200 "MFA enabled successfully"`.
3. Logging in again → `{"requiresMfa": true}`; protected routes correctly return `401 "MFA verification required"` at this point, even with a valid session cookie.
4. `POST /auth/mfa/verify` with a fresh TOTP code → `200 "MFA verified"`; protected routes now accessible.

**Result: PASS.** MFA is enforced as a genuine second authentication gate — a valid session alone is not sufficient for MFA-enrolled accounts until the TOTP step also succeeds. Account restored to `mfaEnabled: false` after testing.

### 1.7 Timing-safe login (user enumeration prevention)

**Test:** Compare response times for a non-existent account vs. a real account with a wrong password.
**Endpoint:** `POST /auth/login`

```
real account (wrong password), 3 runs:        0.1159s, 0.0478s, 0.2059s
non-existent account, 3 runs:                 0.0440s, 0.0361s, 0.0370s
```

**Result: PASS (login endpoint).** Both cases return the identical `401 "Invalid email or password"` body, and timing is within normal request-jitter range for this environment (no consistent multi-times gap) — the login handler's dummy password-hash comparison for non-existent emails equalizes cost as designed.

**Related finding:** A genuine timing side-channel *was* found and fixed on the separate password-reset endpoint (`POST /auth/request-password-reset`), where the real-email branch took roughly 2x as long as the non-existent-email branch pre-fix (~10ms vs ~4.5ms) because only the real-email path performed a database write. This is tracked as **FINDING-004** in `docs/pentest/findings.md`, remediated by padding both branches to a fixed 500ms floor (post-fix: both branches land within a ~20ms band of each other).

---

## 2. Role-Based Access Control

### 2.1 Vertical privilege escalation (role boundary enforcement)

**Test:** As the Waiter role, attempt actions reserved for higher-privileged roles.

| Request | Expected | Actual |
|---|---|---|
| `GET /users` | 403 | **403** |
| `GET /audit/logs` | 403 | **403** |
| `GET /reports/sales` | 403 | **403** |
| `POST /tables` | 403 | **403** |
| `POST /billing/invoices` | 403 | **403** |

**Result: PASS.** `RolesGuard` correctly blocks all five out-of-scope actions for the WAITER role.

### 2.2 Horizontal privilege escalation (IDOR on orders)

**Test:** Waiter A creates an order. Waiter B attempts to access Waiter A's order by ID.
**Endpoint:** `GET /orders/:id`

```
$ curl -b waiter2-session.txt http://localhost:4000/orders/<waiter1-order-id>
{"statusCode":403,"message":"You do not have access to this order", ...}
```

**Result: PASS.** Ownership is enforced server-side (`assertCanAccessOrder`), independent of the frontend's own display filtering. The same test also confirmed a second waiter cannot cancel (`DELETE /orders/:id`) another waiter's order (`403 "You can only update orders you created"`), while a Manager legitimately can (role-based override).

### 2.3 Role re-fetch on every request

**Test:** Change a logged-in user's role directly in the database (bypassing the API entirely) while their session remains active, without a re-login.

```
Before change — same session, GET /users (ADMIN-only):    403
$ UPDATE "User" SET "roleId" = (SELECT id FROM "Role" WHERE name='ADMIN') WHERE email='waiter@restaurant.local';
After change  — same session cookie, no re-login, GET /users:    200
```

**Result: PASS.** `RolesGuard` re-fetches the actor's role from the database on every request rather than trusting a value cached in the session at login time — the privilege change took effect on the very next request. Role reverted to WAITER immediately after the test to restore clean state.

### 2.4 Mass assignment prevention

**Test:** Submit extra, non-DTO fields on login and user-creation requests.

```
POST /auth/login with {"role":"ADMIN","isActive":true} added:
{"statusCode":400,"message":"property role should not exist; property isActive should not exist", ...}

POST /users (admin) with {"isActive":true,"mfaEnabled":true,"failedLoginAttempts":0} added:
{"statusCode":400,"message":"property isActive should not exist; property mfaEnabled should not exist; property failedLoginAttempts should not exist", ...}
```

**Result: PASS.** `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` rejects any request carrying undeclared fields outright, rather than silently stripping them — closing the class of attack where a client sneaks a privileged field (`roleId`, `isActive`) into a request the DTO doesn't expect.

---

## 3. Order State Machine

### 3.1 Invalid state transitions

**Test:** Attempt transitions that skip required intermediate states.
**Endpoint:** `PATCH /orders/:id/status`

```
OPEN -> READY:   {"statusCode":400,"message":"Cannot transition from OPEN to READY. Valid next state(s): SENT_TO_KITCHEN, CANCELLED", ...}
OPEN -> BILLED:  {"statusCode":400,"message":"Cannot transition from OPEN to BILLED. Valid next state(s): SENT_TO_KITCHEN, CANCELLED", ...}
```

**Result: PASS.** The map-based transition table rejects any state skip, listing the only valid next states in the error itself.

### 3.2 Role-restricted transitions

```
Waiter attempts SENT_TO_KITCHEN -> PREPARING (kitchen-only):
{"statusCode":403,"message":"Role WAITER cannot perform this transition", ...}

Kitchen attempts OPEN -> CANCELLED (waiter/manager-only):
{"statusCode":403,"message":"Role KITCHEN cannot perform this transition", ...}
```

**Result: PASS.** Transitions are gated by both a valid-state-machine-edge check *and* a per-edge allowed-roles list (`TRANSITION_ROLES`), so a role permitted to view/act on an order isn't automatically permitted to drive every transition on it.

### 3.3 Price snapshotting

**Test:** Create an order, then change the menu item's price, then generate an invoice for that order.

```
Order created with Coffee at $119.95 (unitPrice snapshotted on the order line item).
Manager changes Coffee's price to $999.99 via PATCH /menu/items/:id.
Invoice generated for the original order:
  "subtotal":"119.95"   <- uses the price at order-creation time, not the new $999.99 price
```

**Result: PASS.** `OrderItem.unitPrice` is captured once at order-creation time and never re-read from the live `MenuItem.price` at invoicing time, so a price change after an order is placed cannot retroactively alter what a customer is billed for an already-placed order. Price restored to $119.95 after the test.

---

## 4. Billing and Financial Controls

### 4.1 Invoice immutability after payment

**Test:** Confirm payment on an invoice, then attempt to confirm it again.
**Endpoint:** `POST /billing/invoices/:id/confirm`

```
First confirm:  "status":"PAID"                                                HTTP:200
Second confirm: {"statusCode":409,"message":"Invoice has already been paid"}   HTTP:409
```

**Result: PASS.** The `status !== UNPAID` guard blocks any second write to an already-settled invoice.

### 4.2 Separation of duties — refund approval

**Test:** As Cashier, request a refund then attempt to approve it.
**Endpoint:** `POST /billing/refunds/:id/approve`

```
$ curl -b cashier-session.txt -X POST http://localhost:4000/billing/refunds/<id>/approve
{"statusCode":403,"message":"You do not have permission to access this resource"}
```

**Result: PASS.** `@Roles('MANAGER','ADMIN')` on the approval endpoint excludes CASHIER entirely — a Cashier cannot self-approve a refund they requested, at the coarse RBAC layer.

### 4.3 Manager self-approval (FINDING-001)

**Test:** As Manager, request a refund and immediately approve the same request with the same session.

**Before fix:** Succeeded (`200`) — `requestedById` and `approvedById` were the identical UUID, defeating the two-step approval workflow entirely, since `MANAGER` is present in the allowed-roles list of *both* the request and approve endpoints.

**After fix:**
```
{"statusCode":403,"message":"You cannot approve a refund that you requested. Another manager or admin must approve it."}
```
A regression check confirmed a *different* Manager/Admin can still legitimately approve the same pending refund.

**Result: PASS (post-remediation).** Full reproduction, root cause, and fix commit: `docs/pentest/findings.md` FINDING-001.

### 4.4 Discount boundary validation

**Test:** Create an invoice with `discountAmount` exceeding `totalAmount`.
**Endpoint:** `POST /billing/invoices`

```
$ curl -b cashier-session.txt -X POST http://localhost:4000/billing/invoices \
    -d '{"orderId":"...","paymentMethod":"CASH","discountAmount":99999}'
{"statusCode":400,"message":"Discount cannot exceed subtotal plus tax"}
```

**Result: PASS.**

---

## 5. Image Upload Security

*(Full detail and raw evidence: `docs/pentest/findings.md`, "Image Upload Feature Security Tests" addendum.)*

Implementation: four independent validation layers — (1) multer `fileFilter` MIME check, (2) multer size/count limits, (3) magic-byte validation against real JPEG/PNG/WebP signatures, (4) server-generated UUID filename with the original filename discarded entirely.

| # | Test | Result |
|---|---|---|
| 5.1 | HTML file declared as `image/jpeg` (MIME filter bypass attempt) | **PASS** — Layer 1 (client-supplied MIME) was satisfied, but Layer 3 (magic-byte check) rejected it: `400 "File content does not match an allowed image type"` |
| 5.2 | Same file — magic-byte validation | **PASS** — content does not start with `FF D8 FF`/`89 50 4E 47`/`52 49 46 46...`, rejected before any disk write |
| 5.3 | 3MB file (exceeds 2MB limit) | **PASS** — `413 "File too large"`, rejected at the multer layer before the body was even fully buffered |
| 5.4 | Valid upload — stored filename | **PASS** — UUID-based filename (`<uuid>.jpg`); original filename appears nowhere on disk, in the DB, in the API response, or in the audit log |
| 5.5 | Waiter attempts upload | **PASS** — `403`, endpoint restricted to `@Roles('ADMIN','MANAGER')` |
| 5.6 | Path traversal on delete (`../../etc/passwd` and URL-encoded variant) | **PASS** — literal traversal never reaches the controller (Express router normalization → `404`); URL-encoded variant rejected by a filename allow-list regex (`400 "Invalid filename"`) |

---

## 6. Stripe Payment Integration

*(Full detail and raw evidence: `docs/pentest/findings.md`, "Stripe Integration Security Verification" addendum.)*

Card data is entered directly into Stripe's own `PaymentElement` iframe and never touches this application's server (PCI-DSS SAQ A) — the server only ever receives a PaymentIntent ID. An invoice is only ever marked `PAID` after `StripeService.constructWebhookEvent` verifies the webhook's HMAC-SHA256 signature.

| # | Test | Result |
|---|---|---|
| 6.1 | Forged webhook (`Stripe-Signature: t=1,v1=forged`) | **PASS** — `400 "Webhook signature verification failed"`, rejected before any invoice lookup |
| 6.2 | Card data isolation | **CONFIRMED** — architectural guarantee (Stripe.js tokenisation); the API never receives a card number, CVC, or expiry at any point |
| 6.3 | Successful payment (test card `4242 4242 4242 4242`) | **PASS** — invoice transitioned to `PAID`, `paymentMethod: STRIPE`, correct PaymentIntent ID recorded, via the webhook (not client-side confirmation) |
| 6.4 | Declined card (test card `4000 0000 0000 0002`) | **PASS** — invoice remained `UNPAID`; `PAYMENT_FAILED` audit entry recorded with the decline reason |

---

## 7. Security Headers and Configuration

### 7.1 HTTP security headers

**Test:** `curl -i http://localhost:4000/auth/me`

| Header | Status |
|---|---|
| `Content-Security-Policy` | **present** |
| `X-Frame-Options: DENY` | **present** |
| `X-Content-Type-Options: nosniff` | **present** |
| `Referrer-Policy: strict-origin-when-cross-origin` | **present** |
| `X-Powered-By` | **absent** |

**Result: PASS.** Full `helmet()` header set applied via `main.ts`; framework fingerprinting header removed. Independently confirmed by an OWASP ZAP baseline scan (`docs/pentest/zap-report.html`): 66 PASS, 0 FAIL-NEW on all header-related passive checks.

### 7.2 CORS enforcement

**Test:** Request with `Origin: http://evil-attacker.com`.

```
{"statusCode":403,"message":"Origin not allowed"}
```
No `Access-Control-Allow-Origin` header is echoed back for the disallowed origin; a legitimate request from `http://localhost:3000` correctly receives the header.

**Result: PASS (post-remediation).** The exact-match origin callback in `main.ts` was always correct; the status code was `500` instead of `403` until FINDING-005 was fixed (`docs/pentest/findings.md`) — now returns the correct `403`.

### 7.3 Request size limit

**Test:** POST body exceeding 100kb.

```
{"statusCode":413,"message":"Request payload too large (max 100kb)"}
```

**Result: PASS (post-remediation).** Same underlying FINDING-005 fix — previously returned a generic `500`, now returns the correct `413` with a clean JSON body (no stack trace).

---

## 8. Audit Logging

### 8.1 Completeness

Distinct action types confirmed present in the live `AuditLog` table (direct DB query, `SELECT DISTINCT action FROM "AuditLog"`), spanning every module: authentication (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `ACCOUNT_UNLOCKED`, `LOGOUT`, `MFA_ENABLED`, `MFA_VERIFIED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`), users/tables/menu/inventory (`USER_CREATED`, `USER_DEACTIVATED`, `TABLE_CREATED`, `TABLE_ASSIGNED`, `MENU_ITEM_CREATED`, `INGREDIENT_CREATED`, `STOCK_ADJUSTED`, `LOW_STOCK_ALERT`), orders (`ORDER_CREATED`, `ORDER_STATUS_UPDATED`), billing (`INVOICE_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_INTENT_CREATED`, `PAYMENT_FAILED`, `REFUND_REQUESTED`, `REFUND_APPROVED`), and images (`IMAGE_UPLOADED`, `IMAGE_DELETED`) — plus a generic interceptor-level entry (`METHOD /path`) for every authenticated request regardless of outcome.

**Result: CONFIRMED.** Both the interceptor-level (generic, every request) and service-level (domain-specific) logging layers are active and populated in the live system.

### 8.2 Sensitive data exclusion

**Test:** Inspect stored `metadata` for authentication and payment-related entries.

```
$ SELECT metadata FROM "AuditLog" WHERE action IN ('LOGIN_SUCCESS','LOGIN_FAILED','PAYMENT_INTENT_CREATED');
{"ip": "::1"}
{"ip": "::1", "attempts": 1}
...
```

**Result: CONFIRMED.** No passwords, password hashes, MFA secrets, Stripe secret keys, session tokens, or card data appear in any inspected `metadata` payload — entries are explicitly constructed field-by-field in each service (never a raw `req.body` dump).

### 8.3 Append-only integrity

**Design decision:** The application database role should be granted `INSERT`/`SELECT` only on the `AuditLog` table, with no `UPDATE`/`DELETE`, so audit integrity holds even if the application layer is compromised.

**Status:** Enforced by convention in this development environment (the local Postgres role used here has full privileges for development convenience); documented as a residual risk and a concrete recommendation for a deployed environment in `docs/threat-model.md`, rather than independently verified against real restricted DB grants in this pass.

---
*Testing performed against the live Docker stack.
API: http://localhost:4000 | Web: http://localhost:3000*

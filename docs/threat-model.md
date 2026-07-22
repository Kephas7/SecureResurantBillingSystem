# Threat Model — Secure Restaurant Billing & Management System

Method: STRIDE, applied per major component. Updated alongside commits
throughout Days 2-7 so the report's "design and implementation" section
can cite real decisions made during development, not reconstructed ones.

## Assets

- Customer/order data
- Payment/invoice records
- Employee accounts and credentials
- Inventory and supplier data
- Audit logs (integrity of evidence itself is an asset)
- System configuration / secrets

## Components / attack surfaces

- Public web frontend (Next.js)
- API (NestJS) — auth endpoints, RBAC-protected resource endpoints
- PostgreSQL database
- Redis (sessions, rate-limit counters)
- CI/CD pipeline and container registry

## STRIDE analysis

Status is one of: **Mitigated** (a specific control addresses the threat),
**Partially Mitigated** (a control exists but has a known gap or is
unverified in the current deployment), **Accepted** (the risk is
acknowledged and deliberately not fully closed, with justification below).

| Component | Threat type | Description | Mitigation | Status |
|---|---|---|---|---|
| Auth endpoints | Spoofing | Credential stuffing / brute force via repeated login attempts | Rate limit 10/60s + account lockout after 5 failures, plus optional CAPTCHA and MFA as further layers | Mitigated |
| Login endpoint | Information Disclosure | User enumeration via response-timing difference between "unknown email" and "wrong password" | A dummy Argon2 hash is verified on the unknown-email path so both cases take statistically the same time | Mitigated |
| Session cookie | Tampering | Session fixation — attacker sets a known session ID before the victim logs in, then reuses it post-login | `req.session.regenerate()` on successful login, plus HttpOnly/Secure/SameSite=Lax cookie attributes | Mitigated |
| Users endpoint | Elevation of Privilege | Admin promotes another account (or their own) to ADMIN via the user-management API | `roleName` excludes ADMIN in Create/UpdateUserDto — promotion to ADMIN requires direct database access | Mitigated |
| Users endpoint | Repudiation / Tampering | Admin deactivates or modifies their own account to disable a control on themselves or obscure an action | Self-modification/self-deactivation blocked in `UsersService` (`id === actorId` check) | Mitigated |
| Table assignment endpoint | Elevation of Privilege | A waiter assigns a *different* waiter to a table, misattributing responsibility | Ownership check in `TablesService.assignWaiter` — a WAITER actor may only assign `waiterId === their own id` | Mitigated |
| Tables endpoint | Tampering | Deleting a table that still has historical order references, corrupting referential/audit integrity | FK constraint plus an explicit any-order-history check in `TablesService.remove` (found and fixed during Day 5 testing — see `docs/orders-testing.md`) | Mitigated |
| Menu item endpoint | Tampering | Manager sets a negative price on a menu item to manipulate billing totals | `@Min(0)` on Create/UpdateMenuItemDto plus a second service-level check before persisting | Mitigated |
| Orders endpoint | Broken Access Control (IDOR) | Waiter fetches another waiter's order by guessing or observing its UUID | Ownership check in `findOne()` and every mutating method (`assertCanAccessOrder`), re-verified on every request, not just listings | Mitigated |
| Orders endpoint | Business Logic / Tampering | Waiter or Kitchen skips the order state machine (e.g. straight to BILLED, bypassing the cashier) | Explicit `ALLOWED_TRANSITIONS` + `TRANSITION_ROLES` map — both the transition and the actor's role are checked before any status change | Mitigated |
| Kitchen queue | Information Disclosure | Kitchen staff see item prices, which have no operational purpose for meal prep and unnecessarily expose financial data | `OrdersService.toResponse` strips `unitPrice`/`menuItem.price` from the API response itself for the KITCHEN role — not just hidden in the UI | Mitigated |
| Invoice endpoint | Tampering | Direct mutation of a PAID invoice (e.g. changing `totalAmount`) bypassing the refund flow | `status !== UNPAID` check in every mutating service method; no code path ever updates a PAID invoice's financial fields directly | Mitigated |
| Billing service | Elevation of Privilege | Cashier calls `approveRefund()` directly to approve their own refund request | Role is independently re-fetched from the DB in `assertIsManagerOrAdmin()` inside `BillingService`, not trusted from the session or the `@Roles()` guard alone | Mitigated |
| Billing service | Repudiation | A discount reduces a bill below its true cost with no clear record of who approved it or why | `discountAmount >= 0` enforced at DTO and service level; invoice creation writes an audit log including `discountAmount` and `paymentMethod` | Partially Mitigated |
| Refund flow | Elevation of Privilege | A Manager both requests *and* approves a refund on the same invoice, with no second approver | `@Roles('CASHIER','MANAGER')` permits a Manager to call both `requestRefund` and `approveRefund` | Accepted |
| Inventory endpoint | Tampering | Manual stock adjustment drives `stockQuantity` negative, masking theft/waste or corrupting downstream reports | `InventoryService.adjustStock` throws `BadRequestException` if the resulting quantity would be negative | Mitigated |
| Inventory service | Tampering (race condition) | Two orders confirming payment concurrently for the same ingredient cause a lost update to `stockQuantity` | Atomic Prisma `{ decrement }` operator used instead of read-then-write | Mitigated |
| Reports endpoint | Information Disclosure | Non-manager staff (e.g. a Waiter) accessing aggregate revenue/staff-performance data they have no business need to see | `@Roles('ADMIN','MANAGER')` applied at the controller level, covering every report endpoint uniformly | Mitigated |
| Order/Invoice API | Repudiation | User denies performing an action (e.g. cancelling a paid order) | Append-only audit log tied to the authenticated actor ID — both interceptor-level (generic HTTP) and service-level (domain-specific) entries | Mitigated |
| Audit log table | Tampering | A compromised app account rewrites logs to hide an earlier action | Application code never issues UPDATE/DELETE against AuditLog; DB role should additionally be restricted to INSERT/SELECT only | Partially Mitigated |
| CI/CD | Tampering / Supply Chain | Malicious dependency introduces a backdoor, or a committed secret leaks credentials | `npm audit --audit-level=high` (blocking, no `continue-on-error`), TruffleHog secrets scan, `.env`-not-committed check, all gated behind the `all-checks` job | Mitigated |
| Database layer | Injection | SQL injection via user-controlled input reaching a query | 100% Prisma ORM query builder, no raw SQL anywhere in the codebase (see `docs/adr/0001-prisma-query-safety.md`) | Mitigated |
| API responses | Information Disclosure | Sensitive User fields (`passwordHash`, `passwordHistory`, `mfaSecretEnc`) leaking via an endpoint that returns a full User row | Explicit Prisma `select` on every User query — never a bare `include`/no-select fetch (see `docs/adr/0002-sensitive-field-exclusion.md`) | Mitigated |
| API (all endpoints) | Denial of Service | Oversized request bodies or scripted request floods exhaust server memory/CPU | 100kb body size limit (`express.json`/`urlencoded`), global 100 req/min rate limit, stricter per-route limits on auth endpoints | Mitigated |
| API responses | Tampering / XSS | A reflected or stored script executes in a victim's browser | CSP (`script-src 'self'`), `X-Content-Type-Options: nosniff`, output is JSON-only (no server-rendered HTML from user input) | Mitigated |
| Cross-origin requests | Tampering | A malicious site makes credentialed requests against the API using the victim's session cookie | Exact-match CORS origin check (no regex/wildcard), `SameSite=Lax` session cookie | Mitigated |
| Session cookie | Tampering/CSRF | SameSite=Lax chosen over Strict — provides CSRF protection on all mutating methods (POST/PUT/PATCH/DELETE) while preserving usability for cross-site navigation. Strict would cause false logged-out states for legitimate users following external links. Trade-off documented and accepted. | Accepted |
| Session with expired password | Elevation of Privilege | User with expired password accesses API directly bypassing frontend redirect | SessionGuard throws 403 with PASSWORD_EXPIRED code on all non-exempt paths | Mitigated |

## Residual risks / accepted risks

- **No real email delivery for password reset.** The dev implementation
  logs the reset token via `Logger.warn` instead of sending an email.
  Acceptable for coursework scope, but means the reset flow can't be
  demonstrated end-to-end through a real inbox, and a production
  deployment must add a transactional email provider before this is
  usable outside development.
- **CAPTCHA is bypassable by anyone who can call the API directly with
  no CAPTCHA token, as long as `CAPTCHA_SECRET_KEY` is unset** — this is
  intentional for local development/testing, but must be verified as set
  in any real deployment. Even when configured, hCaptcha verification
  only confirms a token is valid for the site key at the time it's
  checked; it doesn't independently prove the request originated from
  the browser that solved the challenge.
- **Session secret rotation requires an app restart**, and rotating
  `SESSION_SECRET` also invalidates every currently-stored encrypted MFA
  secret, since `encryptSecret`/`decryptSecret` derive their key from
  that same secret (see the key-management comment in
  `AuthService.encryptSecret`). A production deployment should use a
  dedicated key from a managed secret store instead.
- **Rate limiting uses an in-memory store, not Redis.** Limits reset on
  app restart and are not shared across multiple API instances. Fine for
  this coursework's single-instance deployment; a horizontally-scaled
  production deployment would need a Redis-backed throttler store.
- **A Manager can both request and approve a refund on the same
  invoice** (see the Refund flow row above). Accepted for this
  coursework's scope given the small staff-role model; a stricter
  deployment would want to require a second, different approver for
  refunds a Manager themselves requested.
- **Audit log append-only-ness is an application-layer convention**, not
  a verified database-level guarantee in the current deployment. The app
  never issues UPDATE/DELETE against `AuditLog`, but the Postgres role
  the app connects as has not been independently confirmed to lack
  UPDATE/DELETE grants on that table. Worth verifying explicitly before
  relying on it as a hard guarantee (flagged for Day 8).
- **CI builds container images but doesn't scan them for OS-level
  vulnerabilities** (e.g. via Trivy/Grype). Dependency scanning
  (`npm audit`) covers npm packages only, not vulnerabilities in the
  base images themselves.

## Notes

- Each Day 8 pen test finding should trace back to a row above, or be
  added as a new row if it wasn't anticipated — that gap itself is worth
  discussing in the report's critical analysis section.

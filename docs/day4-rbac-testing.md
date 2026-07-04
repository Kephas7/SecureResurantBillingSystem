# Day 4 - Manual Test Notes: User Management, Tables, Menu, Audit

Environment: API on :4000, web on :3000, Postgres/Redis via docker-compose
(same local setup as prior days). Same browser-automation caveat as Day 3
applies: no browser tool is available in this environment, so the
frontend pages were verified to render (200, no server crash) but not
clicked through interactively. All security-relevant behavior was
exercised directly against the API with curl.

## Test 1 - Admin creates a new user
Logged in as admin, `POST /users` with a new WAITER account
(`test2@restaurant.local`) - **201**, full `SafeUser` object returned (no
`passwordHash`/`passwordHistory`/`mfaSecretEnc`). Confirmed via
`GET /users` that the new account appears in the list. Deactivated
afterward to restore clean test state.

## Test 2 - Role enforcement on the API
Logged in as `waiter@restaurant.local`:
- `GET /users` → **403** (correct - Users module is ADMIN-only)
- `GET /tables` → **200** (correct - WAITER is in the allowed roles list)
- `POST /tables` → **403** (correct - create/update/delete require
  ADMIN/MANAGER)

## Test 3 - IDOR check on the users endpoint
Logged in as `manager@restaurant.local`:
- `GET /users` → **403**
- `GET /users/<admin-user-id>` → **403** - confirms there's no per-ID
  bypass of the `@Roles('ADMIN')` guard on the controller; a MANAGER
  can't read the ADMIN's record by ID even though they could presumably
  guess or discover the UUID some other way.

## Test 4 - Audit log
`GET /audit/logs?limit=10` as admin shows both the interceptor-level
entries (`POST /auth/login`, `POST /users`) and the service-level
domain entries (`LOGIN_SUCCESS`, `USER_CREATED`) with correct actor
emails joined in - matches the dual-logging design from Day 2.

## Test 5 - Account unlock
Triggered 5 consecutive failed logins against `waiter@restaurant.local`.
`GET /users` (admin) confirmed `failedLoginAttempts: 5` and a populated
`lockedUntil` timestamp - the frontend's Unlock-button visibility
condition (`failedLoginAttempts >= 5 || lockedUntil`) would correctly
show the button here. Verified a login attempt with the correct password
returned **403** ("Account is locked") while still locked.
`POST /users/:id/unlock` as admin → **200**. Immediately after, the same
login attempt with the correct password succeeded (**200**).

## Additional checks run beyond the required 5

- **Self-modification protection**: admin attempting `DELETE /users/<own-id>`
  and `PATCH /users/<own-id>` both correctly returned **403** with the
  specific messages from the plan ("Cannot deactivate your own account",
  "Cannot modify your own account through this endpoint").
- **Billing-integrity guard**: `POST /menu/items` with `price: -5`
  correctly rejected with **400** (`class-validator`'s `@Min(0)` on the
  DTO caught it before the service-level defense-in-depth check even
  ran - both layers exist, DTO validation fires first).
- **Route-ordering check**: confirmed `GET /tables/available` and
  `GET /menu/items/available` resolve correctly rather than being
  swallowed by the `:id` route (both are declared before their
  respective `:id` routes in the controllers).

## Suggested Day 8 pentest scenarios building on today's work

- Attempt privilege escalation via `PATCH /users/:id` with a spoofed
  `roleName: "ADMIN"` - should be rejected at the DTO layer
  (`@IsIn(['MANAGER','CASHIER','WAITER','KITCHEN'])`), confirm no way to
  smuggle it through (e.g. case variation, whitespace).
- Confirm a downgraded/deactivated Admin loses `/users`, `/audit` access
  on their *very next* request without needing to log out (RolesGuard's
  DB re-fetch) - this was designed for but not explicitly re-verified
  today with an actual mid-session downgrade.
- Race condition on account unlock vs. concurrent failed-login attempts
  (unlock resets counter to 0 - confirm a failed attempt landing in the
  same window doesn't get lost or double-count).
- Table/menu-item deletion guard bypass: attempt to delete a table or
  menu item referenced by an order in a status just added or just about
  to transition, to check for TOCTOU gaps between the active-order count
  query and the delete.
- Audit log tampering: confirm the `AuditLog` table truly has no
  UPDATE/DELETE grant at the DB role level in a deployed environment
  (this is a stated design intent from Day 2's schema comments, worth
  actually verifying against the running Postgres role/grants, not just
  trusting the comment).
- IDOR sweep across all new `:id` routes (`/tables/:id`,
  `/menu/categories/:id`, `/menu/items/:id`) with a lower-privileged
  role's valid session but a resource ID belonging to/created by another
  actor, since Test 3 today only covered `/users/:id`.

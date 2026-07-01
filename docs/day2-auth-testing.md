# Day 2 - Manual Auth Endpoint Test Notes

Environment: local dev, API on :4000, Postgres (docker, host port 5433 -
see `.env.example` note on the native-Postgres port conflict), Redis (docker,
:6379). Seed data via `npx prisma db seed`.

## Test 1 - Login with admin credentials
`POST /auth/login` `{ email: admin@restaurant.local, password: Admin@Secure123! }`
Result: **200**, `{ requiresMfa: false, role: "ADMIN" }`. Matches expectation.

## Test 2 - Unauthenticated access to a protected route
`GET /` returned **404** (no controller maps that path, so Nest's router
returns 404 before any guard runs - guards only execute for matched
routes). Repeated the test against a real protected, non-`@Public()` route
(`POST /auth/change-password` with no cookie) and got the expected
**401** `"Authentication required"`. Noted as a deviation from the literal
plan step, not a defect: `GET /` was never a real endpoint in this API.

## Test 3 - Brute-force lockout
6 consecutive wrong-password `POST /auth/login` attempts against the admin
account: attempts 1-5 returned **401**, attempt 6 returned **403**
`"Account is locked. Try again in 15 minute(s)"`. Matches expectation.
Account lock/failed-attempt counters were reset via direct DB update after
the test to restore clean seed state.

## Test 4 - Password validation
`LoginDto.password` intentionally has no `@MinLength`/complexity
`@Matches` (only `@IsString`, `@IsNotEmpty`, `@MaxLength(72)`) - see
`auth.dto.ts`. This is deliberate: leaking "password too short" vs "wrong
password" from the login endpoint would let an attacker distinguish
malformed guesses from real ones. So `POST /auth/login` with password
`"short"` is syntactically valid and is evaluated by the auth service like
any other guess (locked out in this run because of the Test 3 state).
Validation *was* exercised where it applies - `POST /auth/register` (admin
session) with `password: "short"` returned **400** with both violated
rules listed:
`"password must contain an uppercase letter, a lowercase letter, a digit,
and a special character; password must be longer than or equal to 12
characters"`.

## Test 5 - Login then logout, old cookie rejected
Login → session cookie (`sid`) issued. `POST /auth/logout` with that
cookie → **200** `"Logged out successfully"`. Re-using the *same* cookie
against `POST /auth/change-password` afterward → **401**
`"Authentication required"`. Matches expectation - `req.session.destroy()`
correctly invalidates the Redis-backed session.

## Additional checks run beyond the required 5

- **Mass assignment**: `POST /auth/login` with extra fields
  (`isActive: true, role: "SUPERADMIN"`) → **400** (rejected by
  `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`).
- **MFA end-to-end**: `mfa/setup` → QR/otpauth URL returned (raw secret
  never sent to client separately); generated a real TOTP token from the
  secret and called `mfa/verify-setup` → **200** `"MFA enabled
  successfully"`. Logged in again → `requiresMfa: true`; protected routes
  correctly returned **401** `"MFA verification required"` until
  `mfa/verify` was called with a fresh token → **200** `"MFA verified"`.
  Admin account reset to `mfaEnabled: false` afterward to restore clean
  seed state for future testing.
- **Audit log**: verified via direct DB query that both the
  interceptor-level (`POST /auth/login`, generic) and service-level
  (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGOUT`, etc.,
  specific) entries were written for every action above, with no request
  bodies or passwords present in `metadata`.

## Suggested tests for the Day 8 pentest phase

- Session fixation: capture a pre-login session id, log in, confirm the
  post-login session id differs (regenerate() behavior).
- Cookie flag verification via browser devtools/proxy: confirm `HttpOnly`,
  `SameSite=Lax`, and (in a TLS-terminated environment) `Secure` are all
  actually set on `sid`.
- Timing analysis on `/auth/login` comparing response time for a
  known-invalid email vs. a valid email + wrong password, to confirm the
  dummy-hash timing mitigation is effective in practice (not just present
  in code).
- Role-tampering: attempt to forge/modify the session cookie or send a
  `role`/`roleId` field on any authenticated request and confirm
  `RolesGuard`'s DB re-fetch prevents privilege escalation.
- Rate-limit bypass attempts on `/auth/login` and `/auth/change-password`
  (e.g. via header spoofing, multiple source IPs) to confirm throttling
  holds up under more adversarial conditions than a straight-line curl loop.
- Password history bypass: confirm changing to a slightly different but
  substantively similar password isn't blocked in a way that leaks history
  contents, and that reusing any of the last 5 hashes is rejected.

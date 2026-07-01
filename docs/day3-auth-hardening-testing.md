# Day 3 - Manual Test Notes: Auth Hardening + Frontend

Environment: API on :4000 (`npm run start:dev`), web on :3000 (`npm run dev`),
Postgres/Redis via docker-compose (same local setup as Day 2).

## Verification method - important caveat

This environment has no browser-automation tool available, so the frontend
was **not** clicked through in an actual browser. What was verified:

- Every new route (`/login`, `/dashboard`, `/mfa-verify`, `/mfa-setup`,
  `/forgot-password`, `/reset-password`) returns **200** and renders its
  initial server-side HTML shell without crashing.
- `npm run build` for both `api` and `web` completes with zero TypeScript
  errors (strict mode intact in both `tsconfig.json` files).
- All underlying API behavior the UI depends on (login, session
  restoration, MFA, password reset, CAPTCHA bypass) was exercised directly
  against the API with curl - this is the logic that actually enforces
  security, and it all passed.

What was **not** verified: that clicking through the actual rendered pages
in a browser (form submission, client-side redirects, the MFA auto-submit
UX, the password-strength meter's visual bar, the hCaptcha widget
rendering) behaves as designed. That needs a manual pass in a real browser
before this is considered UI-complete, not just API-complete.

## Test 1 - Login flow
`POST /auth/login` with admin credentials → **200**
`{ requiresMfa: false, role: "ADMIN" }`. Followed by `GET /auth/me` with
the returned session cookie → **200** with exactly
`{ id, email, fullName, role, mfaEnabled, createdAt }` - confirmed no
`passwordHash`/`passwordHistory`/`mfaSecretEnc` in the response.

## Test 2 - Protected route without a session
`GET /auth/me` with no cookie → **401** `"Authentication required"`.
(Note: `web/dashboard` itself returns 200 from the server since the
redirect-to-login guard runs client-side after hydration, not at the
Next.js server level - this is expected for a client-rendered auth guard
and was not visually confirmed per the caveat above.)

## Test 3 - Logout
`POST /auth/logout` with a valid cookie → **200**. Re-using the same
cookie against `GET /auth/me` afterward → **401**
`"Authentication required"`. Session correctly destroyed in Redis.

## Test 4 - Failed login
Wrong password → **401** `"Invalid email or password"` (generic message,
same for both wrong-password and unknown-email cases per the timing-safe
design from Day 2).

## Test 5 - Password reset stub, end-to-end
1. `POST /auth/request-password-reset { email: admin@restaurant.local }`
   → **200** generic message. Dev token logged to the API console via
   `Logger.warn`.
2. `POST /auth/reset-password { token, newPassword: NewAdmin@Secure456! }`
   → **200** `"Password reset successfully"`.
3. Logged in with the new password → **200**, confirmed the reset took
   effect.
4. Re-used the same (now-consumed) token → **400**
   `"Invalid or expired reset token"` - confirms `usedAt` marking prevents
   token replay, beyond what the plan explicitly asked to check.
5. Restored the account to the documented seed password afterward
   directly via DB update, since `changePassword`/`resetPassword` both
   correctly refuse to reuse a password from history (working as
   designed - this blocked resetting straight back to the original
   password through the normal API).

## Test 6 - User enumeration check
`POST /auth/request-password-reset` with a non-existent email → **200**,
byte-for-byte identical response body to Test 5's step 1. No enumeration
signal.

## Additional checks run beyond the required 6

- **CAPTCHA dev bypass**: confirmed login still works normally with no
  `CAPTCHA_SECRET_KEY` set and no `captchaToken` in the request body -
  `verifyCaptcha()`'s early-return short-circuits as designed.
- **Build integrity**: both `npm run build` (api) and `npm run build`
  (web) succeed from a clean state; `web/tsconfig.json`'s `strict: true`
  was preserved through Next.js's auto-reconfiguration on first build.

## Suggested Day 8 pentest scenarios building on today's work

- CAPTCHA bypass: attempt login without a token once `CAPTCHA_SECRET_KEY`
  is actually configured, and attempt token replay against hCaptcha's
  siteverify.
- Password-reset token brute force: confirm the 32-byte random token
  space and the 5/min throttle on `/auth/reset-password` make guessing a
  valid token infeasible in practice.
- Reset-token lifetime: confirm a token stops working after the 1-hour
  `expiresAt` window, not just after first use.
- Client-side auth-guard bypass: with JS disabled or by calling the API
  directly, confirm that hiding dashboard cards / redirecting
  unauthenticated users client-side has zero effect on actual API access
  (RolesGuard/SessionGuard are the real boundary).
- Session-cookie handling in the browser: confirm `withCredentials: true`
  doesn't leak the session cookie to any non-API origin, and that the
  `sid` cookie's `SameSite=Lax` actually blocks a cross-site POST to
  `/auth/change-password` from a third-party page.
- MFA secret exposure: confirm the raw TOTP secret is never observable in
  any network response after `verify-setup` succeeds (only the encrypted
  form should ever reach the DB, and only the QR/otpauth URL should ever
  reach the client, and only pre-confirmation).

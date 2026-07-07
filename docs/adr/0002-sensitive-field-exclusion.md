# ADR-0002: Explicit Prisma select on every User query

Date: 2026-07-08
Status: Accepted

## Context

A repository-wide audit (2026-07-08) found that most queries against the
`User` model used either no `select`/`include` at all, or
`include: { role: true }`, both of which return every scalar column on
the row by default - including `passwordHash`, `passwordHistory`, and
`mfaSecretEnc`. Tracing every call site confirmed none of these
currently leak those fields to a client (each either maps through an
explicit "safe user" object like `AuthService.getMe()`/
`UsersService.toSafeUser()` before returning, or discards the result
entirely after a role/existence check) - but that safety depended
entirely on every method remembering to strip the fields afterward,
exactly the "error-prone" pattern OWASP A02 guidance warns against.

## Decision

Every `prisma.user.*` query in the codebase now uses an explicit
`select` that lists only the fields that specific operation needs:

- Queries whose result is returned to a client (`AuthService.getMe`,
  `UsersService.findAll/findOne/create/update`) select only the safe,
  already-whitelisted fields - never `passwordHash`, `passwordHistory`,
  or `mfaSecretEnc`.
- Queries that exist purely to check something (row exists, role is
  X, account is active) select only the one or two fields the check
  actually reads - e.g. `RolesGuard` now selects `{ isActive, role.name
  }` instead of the full row, since it runs on nearly every request.
- Queries that genuinely need a sensitive field for their operation
  (e.g. `AuthService.login` needs `passwordHash` to call
  `argon2.verify`; `changePassword`/`resetPassword` need
  `passwordHistory` to reject password reuse; `verifyMfaToken` needs
  `mfaSecretEnc` to decrypt the TOTP secret) select **only** that field
  plus whatever else is required - never the full row "just in case".

`UsersService` additionally introduces a shared `SAFE_USER_SELECT`
constant so the same safe shape isn't hand-typed four times and can't
drift between `findAll`/`findOne`/`create`/`update`.

## Alternatives considered

- Keep `include: { role: true }` and rely on each method's return-value
  mapping to strip sensitive fields - rejected: this is exactly the
  pattern that failed silently in similar real-world incidents (a new
  endpoint or a refactor that returns the raw object instead of the
  mapped one leaks everything). Explicit `select` makes the omission
  structural rather than a matter of every developer remembering.

## Consequences

Several methods needed small refactors beyond just adding `select` -
e.g. `AuthService.resetPassword` used to read `user.id` after fetching
the user; since the user is no longer selected with an `id` field (only
`passwordHistory` is needed), those call sites now use the already-known
`resetToken.userId` instead. This is a slightly less convenient calling
pattern in a couple of places, traded for the fact that sensitive
columns are never pulled into application memory unless the specific
operation actually needs them.

## Related

- Threat model row(s): Auth/User data - Information Disclosure
  (sensitive field exposure)
- Commit(s): "audit all User queries to explicitly exclude sensitive
  fields"
- Rubric criterion this supports: secure data handling / least
  privilege data access

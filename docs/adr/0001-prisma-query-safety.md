# ADR-0001: No raw SQL - all queries via the Prisma ORM query builder

Date: 2026-07-08
Status: Accepted

## Context

SQL injection (OWASP A03: Injection) is one of the most common and
severe web application vulnerabilities. Any place a database query is
built by string-concatenating or interpolating user-controlled input
is a potential injection point. We needed a project-wide policy that
removes this class of vulnerability by construction rather than relying
on developers to remember to parameterise every query correctly.

## Decision

Every database query in this application - across auth, users, tables,
menu, orders, billing, inventory, and reports - uses the Prisma ORM's
typed query builder (`findUnique`, `findMany`, `create`, `update`,
`delete`, `count`, `$transaction`, etc). No query anywhere in
`api/src/modules/` uses `$queryRaw` or `$executeRaw` (verified by
repository-wide search on 2026-07-08 - zero matches). Prisma
parameterises every value passed through its query builder
automatically, so user input can never be interpreted as SQL syntax
regardless of what characters it contains.

If a future feature genuinely requires raw SQL (e.g. a query shape the
query builder can't express), it must use Prisma's `Prisma.sql` tagged
template literal (which still parameterises interpolated values) rather
than plain string concatenation, and the reasoning must be documented
inline at the call site.

## Alternatives considered

- Raw SQL with manual parameterised placeholders (`$1`, `$2`, ...) -
  rejected: correct but relies on every developer getting it right
  every time, with no compile-time or structural guarantee.
- An ORM with an escape hatch used liberally for "simpler" queries -
  rejected: normalizes reaching for raw SQL as a first resort, which is
  exactly the habit this ADR exists to prevent.

## Consequences

Some queries that would be a single line of SQL (e.g. `stockQuantity <=
lowStockThreshold`, which compares two columns on the same row) can't be
expressed directly in Prisma's `where` filter and are instead done by
fetching rows and filtering in application code (see
`InventoryService.findLowStock`). This is an acceptable trade-off at
this project's scale (a single restaurant's data volumes) - injection
safety was prioritised over query elegance for that handful of cases.

## Related

- Threat model row(s): Database layer - Injection (SQL Injection)
- Rubric criterion this supports: input validation / secure data access

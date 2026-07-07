# Day 7 - Final End-to-End Smoke Test (`docker compose up --build`)

This was the first time the application was actually run as a fully
containerized stack rather than API/web run locally with `npm run
start:dev`/`npm run dev` against dockerized Postgres/Redis only (the
workflow used on every previous day). Running the real `docker compose
up --build` command surfaced three real, previously-undetected bugs -
all fixed and verified before Day 7 was considered complete.

## Bugs found and fixed

**1. Containerized API couldn't reach Postgres/Redis.**
`docker-compose.yml`'s `api` service inherited `DATABASE_URL`/`REDIS_HOST`
from the shared root `.env`, which points at `localhost` - correct for
host-side development (reaching the containers' mapped ports), but wrong
inside the `api` container itself, where `localhost` means the container,
not the host. Fixed by overriding `DATABASE_URL`, `REDIS_HOST`, and
`REDIS_PORT` in the `api` service's `environment:` block to use the
docker-compose service names (`postgres`, `redis`) and internal ports
instead. Also added `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_CAPTCHA_SITE_KEY`
as explicit Docker build `args` for the `web` service and corresponding
`ARG`/`ENV` lines in `web/Dockerfile`, since Next.js inlines
`NEXT_PUBLIC_*` vars into the client bundle at build time, not read at
container startup - relying on an incidental local `.env.local` file
being present in the build context (which happened to work by accident)
was not a reproducible fix for anyone else cloning the repo.

**2. `COPY . .` in both Dockerfiles would have copied the host's
`node_modules`** (Windows-native binaries) on top of the container's
freshly `npm ci`-installed Linux ones, corrupting native dependencies
like Prisma's query engine and argon2's compiled bindings. Neither
Dockerfile had a `.dockerignore`, so nothing excluded `node_modules` from
the build context. Added `api/.dockerignore` and `web/.dockerignore`
excluding `node_modules`, build output, `.env*`, and (critically, found
during this same debugging session) `*.tsbuildinfo` - a stale
incremental-TypeScript-build cache file containing host-machine absolute
paths, which was confusing `tsc` inside the container into producing
`.d.ts` declaration files with no corresponding `.js` output at all.

**3. `nest build`'s actual output was `dist/src/main.js`, not
`dist/main.js`** as both `package.json`'s `start` script and
`api/Dockerfile`'s `CMD` assumed. This was never caught because local
development only ever used `npm run start:dev` (which runs from
TypeScript source directly via `nest start --watch`, never touching
`dist/`) - `npm run start`/`node dist/main` had never actually been
exercised before this smoke test. Root cause: `tsconfig.json` had no
`rootDir`, so TypeScript inferred it as the longest common path between
`src/**/*.ts` and `prisma/seed.ts` (both implicitly included with no
`exclude` set), pulling the `src/` folder down a level in the output.
Fixed by adding `"rootDir": "./src"` plus explicit `include`/`exclude` to
`tsconfig.json`, restoring `dist/main.js` as the real entry point.
`prisma/seed.ts` continues to run correctly via `ts-node` directly
(verified) since that invocation doesn't consult `tsconfig.json`'s
`include`/`exclude` at all.

**4. Prisma's query engine failed to load in the container**
(`Error loading shared library libssl.so.1.1: No such file or
directory`). `node:20-alpine` ships no OpenSSL at all, so Prisma's
runtime engine-detection had nothing to probe and defaulted to guessing
OpenSSL 1.1.x, loading a query engine binary built against a library
that was never present. Fixed two ways together: (a) added
`binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` to
`schema.prisma`'s generator block so the correct engine variant is
actually generated, and (b) added `RUN apk add --no-cache openssl` to
both Docker build stages so Prisma's runtime detection can identify the
environment correctly and pick that variant instead of falling back to
the wrong default guess. Neither fix alone was sufficient - the right
binary existing on disk doesn't help if the runtime can't detect which
one to load.

## Full scenario executed against the running containerized stack

1. Admin logged in, created a Waiter account (`day7waiter@restaurant.local`) - **201**.
2. Manager logged in, created 3 tables (101-103) and a "Mains" category
   with 2 items (Grilled Chicken $250, Veggie Pasta $180).
3. The new waiter created an order on Table 101 with both items
   (1x Grilled Chicken, 2x Veggie Pasta) and sent it to kitchen.
4. Kitchen advanced it `PREPARING` → `READY`.
5. Cashier created an invoice - subtotal `610`, tax (13%) `79.3`, total
   `689.3`, matching hand-calculated expected values exactly - then
   confirmed payment (`PAID`).
6. Manager viewed the Sales report for today: `totalRevenue: 1367.02`,
   `totalInvoices: 3` - correctly the sum of this invoice (689.3) plus
   two invoices paid earlier today during Day 6 testing (271.09 +
   406.63), confirming the report aggregates real data correctly, not
   just the most recent transaction. `topMenuItems` correctly listed
   Grilled Chicken and Veggie Pasta alongside the earlier Coffee orders.
7. Admin viewed the audit log: every action from the scenario appeared
   in order with the correct actor attributed - `LOGIN_SUCCESS` for each
   role, `POST /orders`, `ORDER_STATUS_UPDATED` (both transitions),
   `INVOICE_CREATED`, `PAYMENT_CONFIRMED` - both the interceptor-level
   generic entries and the service-level domain-specific entries.

## Outcome

All 4 containers (`postgres`, `redis`, `api`, `web`) run stably via a
single `docker compose up --build`. This is now a genuinely verified,
reproducible path for anyone cloning the repository, not just the
locally-running-services workflow used during days 2-6.

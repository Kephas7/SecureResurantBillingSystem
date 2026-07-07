# Day 6 - Manual Test Notes: Billing, Invoices, Refunds, Inventory

Environment: API on :4000, web on :3000, Postgres/Redis via docker-compose.
Same browser-automation caveat as prior days: frontend pages were
verified to render (200, no crash) but not clicked through interactively.
All financial/state/security-relevant behavior was exercised directly
against the API with curl.

## Test 1 - Full billing flow
Waiter created an order (2x Coffee) on Table 2, sent it to kitchen.
Kitchen advanced it `PREPARING` → `READY`. Cashier created an invoice
(CASH, no discount): **201** with `subtotal: "239.9"`, `taxAmount: "31.19"`
(13% of 239.90, correctly rounded to 2dp), `totalAmount: "271.09"` -
matches hand-calculated expected values exactly. Confirmed payment:
invoice → `PAID` with `paidAt` set, order → `BILLED`, table → `AVAILABLE`.
All four state transitions confirmed in one flow.

## Test 2 - Immutability check
Re-calling `POST /billing/invoices/:id/confirm` on the now-PAID invoice
→ **409** `"Invoice has already been paid"`. Matches the plan's
"400 or 409" expectation.

## Test 3 - Discount validation
`POST /billing/invoices` with `discountAmount: 99999` (far exceeding
subtotal + tax) → **400** `"Discount cannot exceed subtotal plus tax"`.

## Test 4 - Refund separation of duties
Cashier created and paid a second invoice (3x Coffee items, total
$406.63), then requested a refund for the full amount - **201**,
`status: "PENDING"`. Cashier then attempted
`POST /billing/refunds/:id/approve` on their own request - **403**
(blocked at the `RolesGuard` coarse-filter layer, since `@Roles('MANAGER','ADMIN')`
on that route excludes CASHIER - the service-level `assertIsManagerOrAdmin`
re-check never even needed to run here, though it exists as a second
independent layer per the plan's explicit instruction). Manager then
approved the same request - **200** `{"message":"Refund approved"}`,
and `GET /billing/invoices/:id` confirmed `status: "REFUNDED"`.

## Test 5 - Inventory auto-decrement
Created an ingredient ("Coffee Beans", 1000g stock, 100g threshold) via
`POST /inventory/ingredients`, then linked it to the existing Coffee menu
item via a direct `MenuItemIngredient` DB insert (20g per serving) - no
linking UI exists yet, as the plan anticipated. Completed a full
order→kitchen→ready→invoice→payment flow for 3x Coffee. Stock before:
**1000g**. Stock after payment confirmation: **940g** - exactly
`1000 - (3 × 20)`, confirming `decrementForOrder()`'s per-ingredient
accumulation and atomic decrement math.

## Test 6 - Negative stock adjustment guard
`POST /inventory/ingredients/:id/adjust { adjustment: -99999, reason: "test" }`
→ **400** `"Stock adjustment would result in negative stock quantity"`.

## Additional checks run beyond the required 6

- **Low-stock alert trigger**: adjusted the same ingredient down to 50g
  (below its 100g threshold) via `POST /.../adjust` - response included
  `lowStockAlert: true`, and `GET /inventory/ingredients/low-stock`
  correctly listed it afterward.
- **Invoice number sequencing**: the two invoices created today were
  `INV-2026-000001` and `INV-2026-000002` - sequential, zero-padded to 6
  digits, year-prefixed, as designed.
- **Route-ordering check**: confirmed `GET /billing/refunds/pending` and
  `/billing/refunds/decided` resolve correctly rather than being
  swallowed by the `/billing/refunds/:id/approve` param route (both
  literal segments declared first in the controller).

## Suggested Day 8 pentest scenarios building on today's work

- Attempt to request a second refund while one is still `PENDING` for
  the same invoice - the service blocks this with a 409, but wasn't
  independently re-verified today beyond code review.
- Partial refund path: request a refund for less than the full invoice
  total and confirm the invoice lands in `PARTIALLY_REFUNDED` rather than
  `REFUNDED` (today's test only exercised a full-amount refund).
- Concurrent payment confirmation: two near-simultaneous
  `POST /billing/invoices/:id/confirm` calls on the same invoice - confirm
  the `status !== UNPAID` check plus the DB update are actually atomic
  under a race, not just sequentially correct.
- Concurrent inventory decrement: two orders sharing an ingredient
  confirmed for payment at nearly the same time - confirm the atomic
  `{ decrement }` operator genuinely prevents a lost-update race (this
  was the explicit reason for choosing it over read-then-write, but
  wasn't load-tested).
- Attempt to bypass the discount-DTO-level `@Min(0)` check by sending a
  negative `discountAmount` as a string or in an unexpected type, to
  confirm `class-validator`/`class-transformer` coercion doesn't create
  a bypass path.
- Confirm a Manager cannot request a refund on an invoice created by a
  Cashier for personal gain without also needing a *second* Manager/Admin
  to approve it (the `@Roles('CASHIER','MANAGER')` on the request-refund
  endpoint means a Manager can both request *and* approve - worth
  checking whether that's an intentional gap or should require a second
  approver in a stricter deployment).
- Tax-rate tampering: confirm `TAX_RATE` env var changes don't retroactively
  affect already-created invoices (tax is calculated and stored at
  invoice-creation time, not recalculated on read - should already hold
  by design, worth an explicit regression check).

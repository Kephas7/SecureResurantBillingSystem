# Day 5 - Manual Test Notes: Orders, Kitchen Queue, Table Assignment

Environment: API on :4000, web on :3000, Postgres/Redis via docker-compose.
Same browser-automation caveat as Days 3-4: frontend pages were verified
to render (200, no crash) but not clicked through interactively. All
state-machine/IDOR/security-relevant behavior was exercised directly
against the API with curl.

## Bugs found and fixed during testing (not just observed - fixed before considering Day 5 done)

**1. Stale `table.status` in the order-creation response.** The first
`POST /orders` response showed `table.status: "AVAILABLE"` even though
the table was correctly set to `OCCUPIED` in the database (confirmed via
a separate `GET /tables/:id`). Root cause: inside the transaction, the
table's `OCCUPIED` update ran *after* `order.create()`'s nested `include`
had already fetched the table relation, so the response reflected a
snapshot from before the update. Fixed by reordering the transaction to
update the table status first, then create the order. Re-verified with a
fresh table/order and confirmed the response now correctly shows
`OCCUPIED`. `updateStatus()`'s CANCELLED path was checked too and did not
have this bug (table update already ran before the order's `include`
there).

**2. Deleting a table with only *cancelled* order history returned a raw
500.** `TablesService.remove()` only checked for orders in an *active*
status before allowing deletion. But `Order.tableId` is a required
foreign key with no cascade-delete configured, so a table with *any*
order referencing it - even a long-since CANCELLED one - fails the
`DELETE` at the database level with a foreign-key-constraint error, which
surfaced as an unhandled 500. Fixed by adding a second check: block
deletion if *any* order at all references the table (not just active
ones), with a clear 409 message ("Cannot delete a table that has order
history"). This mirrors the existing rationale for soft-deleting Users
(orders are permanent business/audit history, same as audit log entries
referencing a user).

## Test 1 - Create an order as waiter
Logged in as `waiter@restaurant.local`, created a table (none existed
yet - seeded a fresh Table 1), then `POST /orders` with 2 order lines
(3x Coffee total, one with a note) - **201**, order returned with
`status: "OPEN"` and correct `unitPrice` snapshots matching the menu
item's current price.

## Test 2 - State machine enforcement
`PATCH /orders/:id/status { status: "BILLED" }` on a fresh `OPEN` order,
as the waiter who created it - **400** `"Cannot transition from OPEN to
BILLED. Valid next state(s): SENT_TO_KITCHEN, CANCELLED"`. The map-based
transition table correctly rejects the skip-the-cashier attack the plan
called out.

## Test 3 - IDOR protection
Created a second waiter account via admin. Logged in as that waiter and
attempted `GET /orders/<first-waiter-order-id>` - **403**
`"You do not have access to this order"`.

## Test 4 - Kitchen queue flow
Sent the order to kitchen as its owning waiter (`OPEN` → `SENT_TO_KITCHEN`,
**200**). Logged in as `kitchen@restaurant.local`: `GET /orders` showed
exactly that one order. Advanced it `SENT_TO_KITCHEN` → `PREPARING` →
`READY` as kitchen, both **200**. After marking `READY`, `GET /orders` as
kitchen returned `[]` - the order correctly disappeared from the queue
(kitchen's list filter only shows `SENT_TO_KITCHEN`/`PREPARING`).

## Test 5 - Data segregation
`GET /orders` as kitchen, while a second order still existed in `OPEN`
status on a different table, showed **only** the `SENT_TO_KITCHEN` order
- the `OPEN` order was correctly excluded. Also confirmed (beyond what
the plan asked) that the returned item objects had no `unitPrice` field
and no `menuItem.price` field at all for the kitchen role - not just
hidden in the UI, actually absent from the API response body.

## Test 6 - Table assignment
`POST /tables/:id/assign { waiterId: <own id> }` as a waiter - **200**,
assignment created. `POST /tables/:id/assign { waiterId: <other waiter's id> }`
as the same waiter - **403** `"Waiters can only assign themselves to a table"`.

## Additional checks run beyond the required 6

- **Cross-waiter cancellation**: waiter2 attempting `DELETE /orders/<waiter1's-open-order>`
  → **403** `"You can only update orders you created"`.
- **Manager override**: manager successfully cancelled the same order
  (`DELETE /orders/:id` → **200**, status `CANCELLED`), and the table
  correctly reverted to `AVAILABLE`.
- **Status history**: `GET /orders/:id/history` returned the full,
  correctly-ordered transition log: `OPEN→OPEN` (initial), `OPEN→SENT_TO_KITCHEN`,
  `SENT_TO_KITCHEN→PREPARING`, `PREPARING→READY`.
- **Table-assignment takeover**: confirmed (via code review, not a
  separate curl test) that re-assigning a table auto-releases any prior
  active assignment, keeping "at most one active assignment per table"
  as an invariant.

## Suggested Day 8 pentest scenarios building on today's work

- Attempt every invalid `(from, to)` status pair systematically (not just
  the one BILLED-skip tested today) to confirm the transition map has no
  gaps - e.g. `PREPARING → SENT_TO_KITCHEN` (backwards), `CANCELLED → OPEN`
  (resurrecting a cancelled order), `READY → PREPARING`.
- Confirm a WAITER cannot use `PATCH /orders/:id/items` to modify another
  waiter's order even while it's still `OPEN` (the ownership check exists
  in code but wasn't independently re-verified today beyond the read-path
  IDOR test).
- Race condition on table assignment: two waiters attempting to
  self-assign to the same table simultaneously - confirm the "release
  prior assignment" `updateMany` + `create` isn't vulnerable to a
  duplicate-active-assignment race under concurrent requests.
- Race condition on order creation: two concurrent `POST /orders` for the
  same table - confirm both succeed correctly (multiple orders per table
  are allowed) and table status ends up `OCCUPIED` either way, not
  reverted by a losing transaction.
- Menu item deleted/made unavailable *while* an order referencing it is
  still `OPEN` - confirm `updateItems` correctly re-validates availability
  rather than trusting the original snapshot.
- Foreign-key-constraint-as-500 sweep: today's Bug 2 suggests other
  delete endpoints (menu categories/items, users) may have similar gaps
  between their "active reference" check and the full set of DB
  relations that could block a hard delete - worth auditing systematically
  rather than one at a time as they're discovered.

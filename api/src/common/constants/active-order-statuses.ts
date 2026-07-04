import { OrderStatus } from '@prisma/client';

// Orders in any of these statuses still represent a table/menu item in
// active use - only CANCELLED and BILLED orders are terminal. Shared
// between modules (tables, menu) that need to block deletion of a
// resource still referenced by an in-progress order, so the definition
// of "active" can't drift between them.
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.OPEN,
  OrderStatus.SENT_TO_KITCHEN,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.SERVED,
];

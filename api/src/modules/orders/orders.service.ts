import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, TableStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { CreateOrderDto, UpdateOrderItemsDto, UpdateOrderStatusDto } from './orders.dto';

// Explicit allowed-transitions map rather than if/else chains - clearer,
// easier to audit line-by-line, and harder to accidentally leave a hole
// in than scattered conditionals (OWASP Testing Guide - Business Logic
// Testing). Any (from, to) pair not listed here is rejected outright,
// regardless of role.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.OPEN]: [OrderStatus.SENT_TO_KITCHEN, OrderStatus.CANCELLED],
  [OrderStatus.SENT_TO_KITCHEN]: [OrderStatus.PREPARING],
  [OrderStatus.PREPARING]: [OrderStatus.READY],
  [OrderStatus.READY]: [OrderStatus.SERVED],
  [OrderStatus.SERVED]: [OrderStatus.BILLED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.BILLED]: [],
};

// Which roles may perform a given transition, keyed "FROM->TO". A role
// passing this check is necessary but not sufficient for WAITER - see
// the ownership check in updateStatus() for the additional restriction
// that a waiter may only progress orders they created themselves.
const TRANSITION_ROLES: Record<string, string[]> = {
  [`${OrderStatus.OPEN}->${OrderStatus.SENT_TO_KITCHEN}`]: ['WAITER'],
  [`${OrderStatus.SENT_TO_KITCHEN}->${OrderStatus.PREPARING}`]: ['KITCHEN'],
  [`${OrderStatus.PREPARING}->${OrderStatus.READY}`]: ['KITCHEN'],
  [`${OrderStatus.READY}->${OrderStatus.SERVED}`]: ['WAITER'],
  [`${OrderStatus.OPEN}->${OrderStatus.CANCELLED}`]: ['WAITER', 'MANAGER'],
  [`${OrderStatus.SERVED}->${OrderStatus.BILLED}`]: ['CASHIER'],
};

const ORDER_INCLUDE = {
  table: true,
  createdBy: { select: { id: true, fullName: true, email: true } },
  items: { include: { menuItem: { select: { id: true, name: true, price: true } } } },
} satisfies Prisma.OrderInclude;

type RawOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export interface OrderItemResponse {
  id: string;
  quantity: number;
  notes: string | null;
  unitPrice?: string;
  menuItem: { id: string; name: string; price?: string };
}

export interface OrderResponse {
  id: string;
  tableId: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  table: RawOrder['table'];
  createdBy: RawOrder['createdBy'];
  items: OrderItemResponse[];
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // This single method enforces data segregation by role. A waiter
  // calling GET /orders cannot see other waiters' orders. This prevents
  // information disclosure and is a defence against horizontal
  // privilege escalation (OWASP A01: Broken Access Control).
  async findAll(requesterId: string, requesterRole: string): Promise<OrderResponse[]> {
    const where = this.buildListWhere(requesterId, requesterRole);

    const orders = await this.prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => this.toResponse(order, requesterRole));
  }

  async findOne(id: string, requesterId: string, requesterRole: string): Promise<OrderResponse> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.assertCanAccessOrder(order, requesterId, requesterRole);

    return this.toResponse(order, requesterRole);
  }

  async create(dto: CreateOrderDto, creatorId: string): Promise<OrderResponse> {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id: dto.tableId } });
    if (!table) {
      throw new NotFoundException('Table not found');
    }

    if (table.status !== TableStatus.AVAILABLE && table.status !== TableStatus.OCCUPIED) {
      throw new ConflictException(`Cannot create an order on a table that is ${table.status}`);
    }

    const priceByMenuItemId = await this.verifyItemsAvailable(dto.items.map((item) => item.menuItemId));

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          tableId: dto.tableId,
          createdById: creatorId,
          status: OrderStatus.OPEN,
          items: {
            create: dto.items.map((item) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              notes: item.notes,
              // Price is snapshotted at order creation time. If the menu
              // price changes after the order is placed, the invoice
              // reflects the price the customer was shown - this is both
              // correct business logic and prevents a price-manipulation
              // attack where a Manager lowers a price after an order is
              // placed to reduce a bill.
              unitPrice: priceByMenuItemId.get(item.menuItemId)!,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: created.id,
          fromStatus: OrderStatus.OPEN,
          toStatus: OrderStatus.OPEN,
          changedById: creatorId,
        },
      });

      await tx.restaurantTable.update({ where: { id: dto.tableId }, data: { status: TableStatus.OCCUPIED } });

      return created;
    });

    await this.auditLog.write(creatorId, 'ORDER_CREATED', 'Order', order.id, {
      tableId: dto.tableId,
      itemCount: dto.items.length,
    });

    return this.toResponse(order, 'WAITER');
  }

  async updateItems(
    id: string,
    dto: UpdateOrderItemsDto,
    requesterId: string,
    requesterRole: string,
  ): Promise<OrderResponse> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Authorization is checked before business state, so a user who
    // shouldn't see this order at all doesn't even learn its current
    // status from the error message.
    this.assertCanAccessOrder(order, requesterId, requesterRole);

    if (order.status !== OrderStatus.OPEN) {
      throw new ForbiddenException('Order items can only be modified when the order is open');
    }

    const priceByMenuItemId = await this.verifyItemsAvailable(dto.items.map((item) => item.menuItemId));

    const updated = await this.prisma.$transaction(async (tx) => {
      // Replace all existing items with the new set - simpler and safer
      // than diffing, and avoids leaving stale rows with mismatched
      // snapshot prices if an item's price changed between edits.
      await tx.orderItem.deleteMany({ where: { orderId: id } });

      return tx.order.update({
        where: { id },
        data: {
          items: {
            create: dto.items.map((item) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              notes: item.notes,
              unitPrice: priceByMenuItemId.get(item.menuItemId)!,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });
    });

    await this.auditLog.write(requesterId, 'ORDER_ITEMS_UPDATED', 'Order', id, { itemCount: dto.items.length });

    return this.toResponse(updated, requesterRole);
  }

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    requesterId: string,
    requesterRole: string,
  ): Promise<OrderResponse> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const from = order.status;
    const to = dto.status;

    const allowedNext = ALLOWED_TRANSITIONS[from];
    if (!allowedNext.includes(to)) {
      const validNext = allowedNext.length > 0 ? allowedNext.join(', ') : 'none - this is a terminal state';
      throw new BadRequestException(`Cannot transition from ${from} to ${to}. Valid next state(s): ${validNext}`);
    }

    const allowedRoles = TRANSITION_ROLES[`${from}->${to}`] ?? [];
    if (!allowedRoles.includes(requesterRole)) {
      throw new ForbiddenException(`Role ${requesterRole} cannot perform this transition`);
    }

    // A waiter may only progress orders they created themselves, even
    // though the role check above would otherwise permit any waiter to
    // transition any order. The order ID is not secret - any waiter
    // could guess or observe another waiter's order UUID - so ownership
    // must be re-checked here independently of the coarse role gate.
    if (requesterRole === 'WAITER' && order.createdById !== requesterId) {
      throw new ForbiddenException('You can only update orders you created');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.orderStatusHistory.create({
        data: { orderId: id, fromStatus: from, toStatus: to, changedById: requesterId },
      });

      if (to === OrderStatus.CANCELLED) {
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: TableStatus.AVAILABLE } });
      }
      // If status becomes SERVED, the table intentionally stays OCCUPIED
      // until the invoice is paid (billing module, Day 6).

      return tx.order.update({ where: { id }, data: { status: to }, include: ORDER_INCLUDE });
    });

    await this.auditLog.write(requesterId, 'ORDER_STATUS_UPDATED', 'Order', id, { fromStatus: from, toStatus: to });

    return this.toResponse(updated, requesterRole);
  }

  async cancel(id: string, requesterId: string, requesterRole: string): Promise<OrderResponse> {
    return this.updateStatus(id, { status: OrderStatus.CANCELLED }, requesterId, requesterRole);
  }

  async getStatusHistory(id: string, requesterId: string, requesterRole: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.assertCanAccessOrder(order, requesterId, requesterRole);

    return this.prisma.orderStatusHistory.findMany({
      where: { orderId: id },
      orderBy: { changedAt: 'asc' },
    });
  }

  // This is IDOR (Insecure Direct Object Reference) protection. The
  // order ID is not secret - any waiter could guess another waiter's
  // order UUID. The server must verify ownership on every single
  // request, not just listing endpoints (OWASP A01: Broken Access
  // Control - IDOR).
  private assertCanAccessOrder(
    order: { createdById: string; status: OrderStatus },
    requesterId: string,
    requesterRole: string,
  ): void {
    if (requesterRole === 'ADMIN' || requesterRole === 'MANAGER' || requesterRole === 'CASHIER') {
      return;
    }

    if (requesterRole === 'WAITER') {
      if (order.createdById === requesterId) return;
      throw new ForbiddenException('You do not have access to this order');
    }

    if (requesterRole === 'KITCHEN') {
      if (order.status === OrderStatus.SENT_TO_KITCHEN || order.status === OrderStatus.PREPARING) return;
      throw new ForbiddenException('You do not have access to this order');
    }

    throw new ForbiddenException('You do not have access to this order');
  }

  private buildListWhere(requesterId: string, requesterRole: string): Prisma.OrderWhereInput {
    switch (requesterRole) {
      case 'ADMIN':
      case 'MANAGER':
        return {};
      case 'CASHIER':
        return { status: { in: [OrderStatus.READY, OrderStatus.SERVED] } };
      case 'WAITER':
        return { createdById: requesterId };
      case 'KITCHEN':
        return { status: { in: [OrderStatus.SENT_TO_KITCHEN, OrderStatus.PREPARING] } };
      default:
        // Unreachable in practice - RolesGuard only lets recognised
        // roles this far - but fail closed (show nothing) rather than
        // fail open if a new role is ever added without updating this.
        return { id: 'unreachable' };
    }
  }

  private async verifyItemsAvailable(menuItemIds: string[]): Promise<Map<string, Prisma.Decimal>> {
    const uniqueIds = [...new Set(menuItemIds)];
    const menuItems = await this.prisma.menuItem.findMany({ where: { id: { in: uniqueIds } } });

    if (menuItems.length !== uniqueIds.length) {
      throw new NotFoundException('One or more menu items were not found');
    }

    const unavailable = menuItems.filter((item) => !item.isAvailable);
    if (unavailable.length > 0) {
      throw new ConflictException(
        `Cannot order unavailable menu item(s): ${unavailable.map((item) => item.name).join(', ')}`,
      );
    }

    return new Map(menuItems.map((item) => [item.id, item.price]));
  }

  // Kitchen staff must not see prices - this is a least-privilege data
  // minimisation decision. Showing prices to kitchen staff has no
  // operational value and unnecessarily exposes financial data (GDPR
  // data minimisation principle). Enforced here at the API response
  // level, not just hidden in the UI, since a UI-only omission would
  // still leak the data to anyone inspecting network traffic.
  private toResponse(order: RawOrder, requesterRole: string): OrderResponse {
    const includePrice = requesterRole !== 'KITCHEN';

    return {
      id: order.id,
      tableId: order.tableId,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      table: order.table,
      createdBy: order.createdBy,
      items: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        notes: item.notes,
        ...(includePrice ? { unitPrice: item.unitPrice.toString() } : {}),
        menuItem: includePrice
          ? { id: item.menuItem.id, name: item.menuItem.name, price: item.menuItem.price.toString() }
          : { id: item.menuItem.id, name: item.menuItem.name },
      })),
    };
  }
}

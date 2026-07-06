import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RestaurantTable, TableAssignment, TableStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { ACTIVE_ORDER_STATUSES } from '../../common/constants/active-order-statuses';
import { AssignTableDto, CreateTableDto, UpdateTableDto } from './tables.dto';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(): Promise<RestaurantTable[]> {
    return this.prisma.restaurantTable.findMany({ orderBy: { number: 'asc' } });
  }

  async findOne(id: string): Promise<RestaurantTable> {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!table) {
      throw new NotFoundException('Table not found');
    }
    return table;
  }

  async findAvailable(): Promise<RestaurantTable[]> {
    return this.prisma.restaurantTable.findMany({
      where: { status: TableStatus.AVAILABLE },
      orderBy: { number: 'asc' },
    });
  }

  async create(dto: CreateTableDto, actorId: string): Promise<RestaurantTable> {
    const existing = await this.prisma.restaurantTable.findUnique({ where: { number: dto.number } });
    if (existing) {
      throw new ConflictException(`Table number ${dto.number} already exists`);
    }

    const table = await this.prisma.restaurantTable.create({
      data: { number: dto.number, capacity: dto.capacity, status: TableStatus.AVAILABLE },
    });

    await this.auditLog.write(actorId, 'TABLE_CREATED', 'RestaurantTable', table.id, {
      number: dto.number,
      capacity: dto.capacity,
    });

    return table;
  }

  async update(id: string, dto: UpdateTableDto, actorId: string): Promise<RestaurantTable> {
    const existing = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Table not found');
    }

    if (dto.number !== undefined && dto.number !== existing.number) {
      const numberTaken = await this.prisma.restaurantTable.findUnique({ where: { number: dto.number } });
      if (numberTaken) {
        throw new ConflictException(`Table number ${dto.number} already exists`);
      }
    }

    const table = await this.prisma.restaurantTable.update({
      where: { id },
      data: { number: dto.number, capacity: dto.capacity, status: dto.status },
    });

    await this.auditLog.write(actorId, 'TABLE_UPDATED', 'RestaurantTable', id, {
      number: dto.number,
      capacity: dto.capacity,
      status: dto.status,
    });

    return table;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Table not found');
    }

    const activeOrderCount = await this.prisma.order.count({
      where: { tableId: id, status: { in: ACTIVE_ORDER_STATUSES } },
    });

    if (activeOrderCount > 0) {
      throw new ConflictException('Cannot delete a table with active orders');
    }

    // Order.tableId is a required foreign key with no cascade delete, so
    // even a CANCELLED or BILLED order (already excluded from the active
    // check above) still blocks deletion at the DB level - and, more
    // importantly, should: an order is permanent business/audit history,
    // the same reason Users are soft-deleted rather than removed. Check
    // for this explicitly so the caller gets a clear 409 instead of a
    // raw foreign-key-constraint 500.
    const anyOrderCount = await this.prisma.order.count({ where: { tableId: id } });
    if (anyOrderCount > 0) {
      throw new ConflictException('Cannot delete a table that has order history');
    }

    await this.prisma.restaurantTable.delete({ where: { id } });

    await this.auditLog.write(actorId, 'TABLE_DELETED', 'RestaurantTable', id);
  }

  async assignWaiter(
    tableId: string,
    dto: AssignTableDto,
    actorId: string,
    actorRole: string,
  ): Promise<TableAssignment> {
    // A waiter may only assign themselves - never another waiter. This
    // prevents one waiter from (maliciously or by mistake) taking a
    // table off another waiter's assignment list, which would misroute
    // orders/tips/responsibility for that table.
    if (actorRole === 'WAITER' && dto.waiterId !== actorId) {
      throw new ForbiddenException('Waiters can only assign themselves to a table');
    }

    const table = await this.prisma.restaurantTable.findUnique({ where: { id: tableId } });
    if (!table) {
      throw new NotFoundException('Table not found');
    }

    const waiter = await this.prisma.user.findUnique({ where: { id: dto.waiterId }, include: { role: true } });
    if (!waiter || waiter.role.name !== 'WAITER') {
      throw new NotFoundException('Waiter not found');
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      // At most one active assignment per table - taking over a table
      // implicitly releases whoever held it before, rather than leaving
      // two "active" assignment rows and an ambiguous answer to "whose
      // table is this".
      await tx.tableAssignment.updateMany({
        where: { tableId, releasedAt: null },
        data: { releasedAt: new Date() },
      });

      return tx.tableAssignment.create({
        data: { tableId, waiterId: dto.waiterId },
      });
    });

    await this.auditLog.write(actorId, 'TABLE_ASSIGNED', 'RestaurantTable', tableId, { waiterId: dto.waiterId });

    return assignment;
  }

  async releaseTable(tableId: string, actorId: string, actorRole: string): Promise<void> {
    const activeAssignment = await this.prisma.tableAssignment.findFirst({
      where: { tableId, releasedAt: null },
    });

    if (!activeAssignment) {
      throw new NotFoundException('No active assignment for this table');
    }

    // Same ownership principle as assignment: a waiter can only release
    // their own assignment, not release another waiter from a table out
    // from under them.
    if (actorRole === 'WAITER' && activeAssignment.waiterId !== actorId) {
      throw new ForbiddenException('Waiters can only release their own table assignment');
    }

    await this.prisma.tableAssignment.update({
      where: { id: activeAssignment.id },
      data: { releasedAt: new Date() },
    });

    await this.auditLog.write(actorId, 'TABLE_RELEASED', 'RestaurantTable', tableId, {
      waiterId: activeAssignment.waiterId,
    });
  }

  async getTableAssignment(tableId: string): Promise<TableAssignment | null> {
    return this.prisma.tableAssignment.findFirst({
      where: { tableId, releasedAt: null },
    });
  }
}

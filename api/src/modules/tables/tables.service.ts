import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { RestaurantTable, TableStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { ACTIVE_ORDER_STATUSES } from '../../common/constants/active-order-statuses';
import { CreateTableDto, UpdateTableDto } from './tables.dto';

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

    await this.prisma.restaurantTable.delete({ where: { id } });

    await this.auditLog.write(actorId, 'TABLE_DELETED', 'RestaurantTable', id);
  }
}

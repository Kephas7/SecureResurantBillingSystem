import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MenuCategory, MenuItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { ACTIVE_ORDER_STATUSES } from '../../common/constants/active-order-statuses';
import { CreateCategoryDto, CreateMenuItemDto, UpdateCategoryDto, UpdateMenuItemDto } from './menu.dto';

type CategoryWithCount = MenuCategory & { _count: { items: number } };
type MenuItemWithCategory = MenuItem & { category: { name: string } };

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // -- Categories --

  async findAllCategories(): Promise<CategoryWithCount[]> {
    return this.prisma.menuCategory.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOneCategory(id: string): Promise<MenuCategory> {
    const category = await this.prisma.menuCategory.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Menu category not found');
    }
    return category;
  }

  async createCategory(dto: CreateCategoryDto, actorId: string): Promise<MenuCategory> {
    const existing = await this.prisma.menuCategory.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    const category = await this.prisma.menuCategory.create({ data: { name: dto.name } });
    await this.auditLog.write(actorId, 'MENU_CATEGORY_CREATED', 'MenuCategory', category.id, { name: dto.name });

    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, actorId: string): Promise<MenuCategory> {
    const existing = await this.prisma.menuCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Menu category not found');
    }

    if (dto.name && dto.name !== existing.name) {
      const nameTaken = await this.prisma.menuCategory.findUnique({ where: { name: dto.name } });
      if (nameTaken) {
        throw new ConflictException(`Category "${dto.name}" already exists`);
      }
    }

    const category = await this.prisma.menuCategory.update({ where: { id }, data: { name: dto.name } });
    await this.auditLog.write(actorId, 'MENU_CATEGORY_UPDATED', 'MenuCategory', id, { name: dto.name });

    return category;
  }

  async removeCategory(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.menuCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Menu category not found');
    }

    const itemCount = await this.prisma.menuItem.count({ where: { categoryId: id } });
    if (itemCount > 0) {
      throw new ConflictException('Cannot delete a category that still has menu items');
    }

    await this.prisma.menuCategory.delete({ where: { id } });
    await this.auditLog.write(actorId, 'MENU_CATEGORY_DELETED', 'MenuCategory', id);
  }

  // -- Menu items --

  async findAllItems(): Promise<MenuItemWithCategory[]> {
    return this.prisma.menuItem.findMany({
      include: { category: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findAvailableItems(): Promise<MenuItemWithCategory[]> {
    return this.prisma.menuItem.findMany({
      where: { isAvailable: true },
      include: { category: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOneItem(id: string): Promise<MenuItem> {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Menu item not found');
    }
    return item;
  }

  async createItem(dto: CreateMenuItemDto, actorId: string): Promise<MenuItem> {
    const category = await this.prisma.menuCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) {
      throw new NotFoundException('Menu category not found');
    }

    // SECURITY: price is stored as Decimal - validated >= 0 here even
    // though CreateMenuItemDto's @Min(0) already enforces it, because a
    // negative price reaching billing logic could be used to inflate a
    // refund or discount a bill below its true cost (a billing-integrity
    // attack, not just a data-quality issue). Defense in depth: never
    // trust a single validation layer for a value that flows into money
    // calculations.
    if (dto.price < 0) {
      throw new ConflictException('Price must not be negative');
    }

    const item = await this.prisma.menuItem.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        categoryId: dto.categoryId,
        isAvailable: dto.isAvailable ?? true,
        imageUrl: dto.imageUrl,
      },
    });

    await this.auditLog.write(actorId, 'MENU_ITEM_CREATED', 'MenuItem', item.id, {
      name: dto.name,
      price: dto.price,
      categoryId: dto.categoryId,
    });

    return item;
  }

  async updateItem(id: string, dto: UpdateMenuItemDto, actorId: string): Promise<MenuItem> {
    const existing = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Menu item not found');
    }

    if (dto.categoryId) {
      const category = await this.prisma.menuCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category) {
        throw new NotFoundException('Menu category not found');
      }
    }

    // Same billing-integrity rationale as createItem() above.
    if (dto.price !== undefined && dto.price < 0) {
      throw new ConflictException('Price must not be negative');
    }

    const item = await this.prisma.menuItem.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        categoryId: dto.categoryId,
        isAvailable: dto.isAvailable,
        imageUrl: dto.imageUrl,
      },
    });

    await this.auditLog.write(actorId, 'MENU_ITEM_UPDATED', 'MenuItem', id, {
      name: dto.name,
      price: dto.price,
      categoryId: dto.categoryId,
      isAvailable: dto.isAvailable,
    });

    return item;
  }

  async toggleAvailability(id: string, actorId: string): Promise<MenuItem> {
    const existing = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Menu item not found');
    }

    const item = await this.prisma.menuItem.update({
      where: { id },
      data: { isAvailable: !existing.isAvailable },
    });

    await this.auditLog.write(actorId, 'MENU_ITEM_AVAILABILITY_TOGGLED', 'MenuItem', id, {
      isAvailable: item.isAvailable,
    });

    return item;
  }

  async removeItem(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Menu item not found');
    }

    const activeOrderItemCount = await this.prisma.orderItem.count({
      where: { menuItemId: id, order: { status: { in: ACTIVE_ORDER_STATUSES } } },
    });

    if (activeOrderItemCount > 0) {
      throw new ConflictException('Cannot delete a menu item referenced by an active order');
    }

    await this.prisma.menuItem.delete({ where: { id } });
    await this.auditLog.write(actorId, 'MENU_ITEM_DELETED', 'MenuItem', id);
  }
}

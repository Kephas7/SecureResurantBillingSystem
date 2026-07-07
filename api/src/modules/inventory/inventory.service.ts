import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Ingredient, Prisma, Supplier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { AdjustStockDto, CreateIngredientDto, CreateSupplierDto, UpdateIngredientDto, UpdateSupplierDto } from './inventory.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // -- Ingredients --

  async findAllIngredients(): Promise<Ingredient[]> {
    return this.prisma.ingredient.findMany({
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findLowStock(): Promise<Ingredient[]> {
    // stockQuantity <= lowStockThreshold compares two columns on the
    // same row, which Prisma's `where` filters can't express directly
    // (they compare a column to a literal, not to another column). At
    // this scale (a single restaurant's ingredient list) filtering in
    // application code after one query is simpler and safer than raw SQL.
    const ingredients = await this.prisma.ingredient.findMany({
      include: { supplier: { select: { id: true, name: true } } },
    });
    return ingredients.filter((ingredient) => ingredient.stockQuantity.lte(ingredient.lowStockThreshold));
  }

  async findOneIngredient(id: string): Promise<Ingredient> {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id },
      include: { supplier: { select: { id: true, name: true } } },
    });
    if (!ingredient) {
      throw new NotFoundException('Ingredient not found');
    }
    return ingredient;
  }

  async createIngredient(dto: CreateIngredientDto, actorId: string): Promise<Ingredient> {
    if (dto.supplierId) {
      await this.assertSupplierExists(dto.supplierId);
    }

    const ingredient = await this.prisma.ingredient.create({
      data: {
        name: dto.name,
        unit: dto.unit,
        stockQuantity: dto.stockQuantity,
        lowStockThreshold: dto.lowStockThreshold,
        supplierId: dto.supplierId,
      },
    });

    await this.auditLog.write(actorId, 'INGREDIENT_CREATED', 'Ingredient', ingredient.id, {
      name: dto.name,
      stockQuantity: String(dto.stockQuantity),
    });

    return ingredient;
  }

  async updateIngredient(id: string, dto: UpdateIngredientDto, actorId: string): Promise<Ingredient> {
    const existing = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Ingredient not found');
    }

    if (dto.supplierId) {
      await this.assertSupplierExists(dto.supplierId);
    }

    const ingredient = await this.prisma.ingredient.update({
      where: { id },
      data: {
        name: dto.name,
        unit: dto.unit,
        stockQuantity: dto.stockQuantity,
        lowStockThreshold: dto.lowStockThreshold,
        supplierId: dto.supplierId,
      },
    });

    await this.auditLog.write(actorId, 'INGREDIENT_UPDATED', 'Ingredient', id, {
      name: dto.name,
      stockQuantity: dto.stockQuantity !== undefined ? String(dto.stockQuantity) : undefined,
    });

    return ingredient;
  }

  async adjustStock(id: string, dto: AdjustStockDto, actorId: string): Promise<Ingredient & { lowStockAlert: boolean }> {
    const ingredient = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!ingredient) {
      throw new NotFoundException('Ingredient not found');
    }

    const newQuantity = ingredient.stockQuantity.add(dto.adjustment);

    // Negative stock is prevented as a data integrity control - it would
    // indicate a bookkeeping error and could mask theft or waste that
    // should be investigated, rather than silently going negative.
    if (newQuantity.lt(0)) {
      throw new BadRequestException('Stock adjustment would result in negative stock quantity');
    }

    const updated = await this.prisma.ingredient.update({
      where: { id },
      data: { stockQuantity: newQuantity },
    });

    const lowStockAlert = newQuantity.lte(updated.lowStockThreshold);

    if (lowStockAlert) {
      await this.auditLog.write(actorId, 'LOW_STOCK_ALERT', 'Ingredient', id, {
        ingredientName: updated.name,
        newQty: newQuantity.toString(),
        threshold: updated.lowStockThreshold.toString(),
      });
    }

    await this.auditLog.write(actorId, 'STOCK_ADJUSTED', 'Ingredient', id, {
      adjustment: String(dto.adjustment),
      reason: dto.reason,
      actorId,
    });

    return { ...updated, lowStockAlert };
  }

  // Inventory decrement is triggered automatically on payment
  // confirmation, not on order creation. This reflects real restaurant
  // operations - ingredients are consumed when food is prepared, but the
  // system records it at the point of confirmed sale for simplicity.
  async decrementForOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            menuItem: { include: { ingredients: { include: { ingredient: true } } } },
          },
        },
      },
    });

    if (!order) {
      this.logger.warn(`decrementForOrder called with unknown order ${orderId}`);
      return;
    }

    // Accumulate per-ingredient totals first (an order can reference the
    // same ingredient via more than one menu item), then apply one
    // atomic DB-level decrement per ingredient - avoids a read-then-write
    // race against concurrent orders touching the same ingredient.
    const decrementByIngredientId = new Map<string, Prisma.Decimal>();
    for (const orderItem of order.items) {
      for (const link of orderItem.menuItem.ingredients) {
        const amount = link.quantityUsed.mul(orderItem.quantity);
        const existing = decrementByIngredientId.get(link.ingredientId) ?? new Prisma.Decimal(0);
        decrementByIngredientId.set(link.ingredientId, existing.add(amount));
      }
    }

    for (const [ingredientId, amount] of decrementByIngredientId) {
      const updated = await this.prisma.ingredient.update({
        where: { id: ingredientId },
        data: { stockQuantity: { decrement: amount } },
      });

      // If any ingredient would go below 0, log a warning but do NOT
      // block payment - the sale already happened, so negative stock at
      // this point is a management alert, not a payment blocker.
      if (updated.stockQuantity.lt(0)) {
        this.logger.warn(
          `Ingredient "${updated.name}" went negative after order ${orderId}: ${updated.stockQuantity.toString()}`,
        );
      }

      if (updated.stockQuantity.lte(updated.lowStockThreshold)) {
        await this.auditLog.write(null, 'LOW_STOCK_ALERT', 'Ingredient', ingredientId, {
          ingredientName: updated.name,
          newQty: updated.stockQuantity.toString(),
          threshold: updated.lowStockThreshold.toString(),
        });
      }
    }
  }

  // -- Suppliers --

  async findAllSuppliers(): Promise<Supplier[]> {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  async findOneSupplier(id: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return supplier;
  }

  async createSupplier(dto: CreateSupplierDto, actorId: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.create({ data: dto });
    await this.auditLog.write(actorId, 'SUPPLIER_CREATED', 'Supplier', supplier.id, { name: dto.name });
    return supplier;
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto, actorId: string): Promise<Supplier> {
    await this.assertSupplierExists(id);

    const supplier = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.auditLog.write(actorId, 'SUPPLIER_UPDATED', 'Supplier', id, { name: dto.name });
    return supplier;
  }

  private async assertSupplierExists(id: string): Promise<void> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
  }
}

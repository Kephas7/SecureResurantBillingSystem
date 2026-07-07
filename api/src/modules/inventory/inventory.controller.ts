import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Ingredient, Supplier } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { InventoryService } from './inventory.service';
import {
  AdjustStockDto,
  CreateIngredientDto,
  CreateSupplierDto,
  UpdateIngredientDto,
  UpdateSupplierDto,
} from './inventory.dto';

@Controller('inventory')
@Roles('ADMIN', 'MANAGER')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('ingredients')
  async findAllIngredients(): Promise<Ingredient[]> {
    return this.inventoryService.findAllIngredients();
  }

  @Get('ingredients/low-stock')
  async findLowStock(): Promise<Ingredient[]> {
    return this.inventoryService.findLowStock();
  }

  @Get('ingredients/:id')
  async findOneIngredient(@Param('id') id: string): Promise<Ingredient> {
    return this.inventoryService.findOneIngredient(id);
  }

  @HttpCode(HttpStatus.CREATED)
  @Post('ingredients')
  async createIngredient(@Body() dto: CreateIngredientDto, @CurrentUser() actorId: string): Promise<Ingredient> {
    return this.inventoryService.createIngredient(dto, actorId);
  }

  @Patch('ingredients/:id')
  async updateIngredient(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
    @CurrentUser() actorId: string,
  ): Promise<Ingredient> {
    return this.inventoryService.updateIngredient(id, dto, actorId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('ingredients/:id/adjust')
  async adjustStock(
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() actorId: string,
  ) {
    return this.inventoryService.adjustStock(id, dto, actorId);
  }

  @Get('suppliers')
  async findAllSuppliers(): Promise<Supplier[]> {
    return this.inventoryService.findAllSuppliers();
  }

  @HttpCode(HttpStatus.CREATED)
  @Post('suppliers')
  async createSupplier(@Body() dto: CreateSupplierDto, @CurrentUser() actorId: string): Promise<Supplier> {
    return this.inventoryService.createSupplier(dto, actorId);
  }

  @Patch('suppliers/:id')
  async updateSupplier(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() actorId: string,
  ): Promise<Supplier> {
    return this.inventoryService.updateSupplier(id, dto, actorId);
  }
}

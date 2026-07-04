import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { MenuCategory, MenuItem } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MenuService } from './menu.service';
import { CreateCategoryDto, CreateMenuItemDto, UpdateCategoryDto, UpdateMenuItemDto } from './menu.dto';

const ALL_STAFF_ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'];
const MANAGEMENT_ROLES = ['ADMIN', 'MANAGER'];

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  // -- Categories --

  @Roles(...ALL_STAFF_ROLES)
  @Get('categories')
  async findAllCategories() {
    return this.menuService.findAllCategories();
  }

  @Roles(...ALL_STAFF_ROLES)
  @Get('categories/:id')
  async findOneCategory(@Param('id') id: string): Promise<MenuCategory> {
    return this.menuService.findOneCategory(id);
  }

  @Roles(...MANAGEMENT_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @Post('categories')
  async createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() actorId: string): Promise<MenuCategory> {
    return this.menuService.createCategory(dto, actorId);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() actorId: string,
  ): Promise<MenuCategory> {
    return this.menuService.updateCategory(id, dto, actorId);
  }

  @Roles(...MANAGEMENT_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('categories/:id')
  async removeCategory(@Param('id') id: string, @CurrentUser() actorId: string): Promise<void> {
    await this.menuService.removeCategory(id, actorId);
  }

  // -- Menu items --

  @Roles(...ALL_STAFF_ROLES)
  @Get('items')
  async findAllItems() {
    return this.menuService.findAllItems();
  }

  @Roles(...ALL_STAFF_ROLES)
  @Get('items/available')
  async findAvailableItems() {
    return this.menuService.findAvailableItems();
  }

  @Roles(...ALL_STAFF_ROLES)
  @Get('items/:id')
  async findOneItem(@Param('id') id: string): Promise<MenuItem> {
    return this.menuService.findOneItem(id);
  }

  @Roles(...MANAGEMENT_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @Post('items')
  async createItem(@Body() dto: CreateMenuItemDto, @CurrentUser() actorId: string): Promise<MenuItem> {
    return this.menuService.createItem(dto, actorId);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch('items/:id')
  async updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
    @CurrentUser() actorId: string,
  ): Promise<MenuItem> {
    return this.menuService.updateItem(id, dto, actorId);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch('items/:id/toggle')
  async toggleItem(@Param('id') id: string, @CurrentUser() actorId: string): Promise<MenuItem> {
    return this.menuService.toggleAvailability(id, actorId);
  }

  @Roles(...MANAGEMENT_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('items/:id')
  async removeItem(@Param('id') id: string, @CurrentUser() actorId: string): Promise<void> {
    await this.menuService.removeItem(id, actorId);
  }
}

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { RestaurantTable, TableAssignment } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUserRole } from '../../common/decorators/current-user-role.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TablesService } from './tables.service';
import { AssignTableDto, CreateTableDto, UpdateTableDto } from './tables.dto';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Get()
  async findAll(): Promise<RestaurantTable[]> {
    return this.tablesService.findAll();
  }

  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Get('available')
  async findAvailable(): Promise<RestaurantTable[]> {
    return this.tablesService.findAvailable();
  }

  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<RestaurantTable> {
    return this.tablesService.findOne(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Body() dto: CreateTableDto, @CurrentUser() actorId: string): Promise<RestaurantTable> {
    return this.tablesService.create(dto, actorId);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTableDto,
    @CurrentUser() actorId: string,
  ): Promise<RestaurantTable> {
    return this.tablesService.update(id, dto, actorId);
  }

  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() actorId: string): Promise<void> {
    await this.tablesService.remove(id, actorId);
  }

  @Roles('WAITER', 'MANAGER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post(':id/assign')
  async assignWaiter(
    @Param('id') id: string,
    @Body() dto: AssignTableDto,
    @CurrentUser() actorId: string,
    @CurrentUserRole() actorRole: string,
  ): Promise<TableAssignment> {
    return this.tablesService.assignWaiter(id, dto, actorId, actorRole);
  }

  @Roles('WAITER', 'MANAGER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post(':id/release')
  async releaseTable(
    @Param('id') id: string,
    @CurrentUser() actorId: string,
    @CurrentUserRole() actorRole: string,
  ): Promise<{ message: string }> {
    await this.tablesService.releaseTable(id, actorId, actorRole);
    return { message: 'Table released successfully' };
  }

  @Roles('ADMIN', 'MANAGER', 'WAITER')
  @Get(':id/assignment')
  async getAssignment(@Param('id') id: string): Promise<TableAssignment | null> {
    return this.tablesService.getTableAssignment(id);
  }
}

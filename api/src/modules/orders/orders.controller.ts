import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUserRole } from '../../common/decorators/current-user-role.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrdersService, OrderResponse } from './orders.service';
import { CreateOrderDto, UpdateOrderItemsDto, UpdateOrderStatusDto } from './orders.dto';

// The controller delegates all access control decisions to the service
// layer, which applies both role-based and ownership-based checks. The
// @Roles() decorator here is a coarse-grained first filter; the service
// provides fine-grained IDOR protection (see OrdersService.assertCanAccessOrder).
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN')
  @Get()
  async findAll(
    @CurrentUser() userId: string,
    @CurrentUserRole() role: string,
  ): Promise<OrderResponse[]> {
    return this.ordersService.findAll(userId, role);
  }

  @Roles('ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN')
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() userId: string,
    @CurrentUserRole() role: string,
  ): Promise<OrderResponse> {
    return this.ordersService.findOne(id, userId, role);
  }

  @Roles('WAITER')
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Body() dto: CreateOrderDto, @CurrentUser() userId: string): Promise<OrderResponse> {
    return this.ordersService.create(dto, userId);
  }

  @Roles('WAITER', 'MANAGER')
  @Patch(':id/items')
  async updateItems(
    @Param('id') id: string,
    @Body() dto: UpdateOrderItemsDto,
    @CurrentUser() userId: string,
    @CurrentUserRole() role: string,
  ): Promise<OrderResponse> {
    return this.ordersService.updateItems(id, dto, userId, role);
  }

  @Roles('WAITER', 'KITCHEN', 'MANAGER', 'CASHIER')
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() userId: string,
    @CurrentUserRole() role: string,
  ): Promise<OrderResponse> {
    return this.ordersService.updateStatus(id, dto, userId, role);
  }

  @Roles('WAITER', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() userId: string,
    @CurrentUserRole() role: string,
  ): Promise<OrderResponse> {
    return this.ordersService.cancel(id, userId, role);
  }

  @Roles('ADMIN', 'MANAGER', 'WAITER')
  @Get(':id/history')
  async getStatusHistory(
    @Param('id') id: string,
    @CurrentUser() userId: string,
    @CurrentUserRole() role: string,
  ) {
    return this.ordersService.getStatusHistory(id, userId, role);
  }
}

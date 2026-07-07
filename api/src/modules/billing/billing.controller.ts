import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BillingService } from './billing.service';
import { CreateInvoiceDto, PaginationQueryDto, RequestRefundDto } from './billing.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  @Get('invoices')
  async findAll(@Query() query: PaginationQueryDto) {
    return this.billingService.findAll(query.page ?? DEFAULT_PAGE, query.limit ?? DEFAULT_LIMIT);
  }

  // Declared before 'invoices/:id' so the literal 'order' segment isn't
  // swallowed by the :id param route.
  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  @Get('invoices/order/:orderId')
  async getInvoiceByOrder(@Param('orderId') orderId: string) {
    return this.billingService.getInvoiceByOrder(orderId);
  }

  @Roles('ADMIN', 'MANAGER', 'CASHIER')
  @Get('invoices/:id')
  async getInvoice(@Param('id') id: string) {
    return this.billingService.getInvoice(id);
  }

  @Roles('CASHIER')
  @HttpCode(HttpStatus.CREATED)
  @Post('invoices')
  async createInvoice(@Body() dto: CreateInvoiceDto, @CurrentUser() cashierId: string) {
    return this.billingService.createInvoice(dto, cashierId);
  }

  @Roles('CASHIER')
  @HttpCode(HttpStatus.OK)
  @Post('invoices/:id/confirm')
  async confirmPayment(@Param('id') id: string, @CurrentUser() cashierId: string) {
    return this.billingService.confirmPayment(id, cashierId);
  }

  @Roles('CASHIER', 'MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @Post('invoices/:id/refund')
  async requestRefund(
    @Param('id') id: string,
    @Body() dto: RequestRefundDto,
    @CurrentUser() requesterId: string,
  ) {
    return this.billingService.requestRefund(id, requesterId, dto.reason, dto.amount);
  }

  // Declared before 'refunds/:id/approve' below only matters relative to
  // other 'refunds/*' routes - 'pending' and 'decided' are literal
  // segments so they must come before any '/refunds/:id...' pattern.
  @Roles('MANAGER', 'ADMIN')
  @Get('refunds/pending')
  async getPendingRefunds() {
    return this.billingService.getPendingRefunds();
  }

  @Roles('MANAGER', 'ADMIN')
  @Get('refunds/decided')
  async getDecidedRefunds(@Query('limit') limit?: string) {
    return this.billingService.getDecidedRefunds(limit ? Number(limit) : 20);
  }

  @Roles('MANAGER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post('refunds/:id/approve')
  async approveRefund(@Param('id') id: string, @CurrentUser() managerId: string) {
    return this.billingService.approveRefund(id, managerId);
  }

  @Roles('MANAGER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post('refunds/:id/reject')
  async rejectRefund(@Param('id') id: string, @CurrentUser() managerId: string) {
    return this.billingService.rejectRefund(id, managerId);
  }
}

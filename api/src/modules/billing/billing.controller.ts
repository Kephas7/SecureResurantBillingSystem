import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/guards/session.guard';
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

  // SECURITY (cite in report): only a Cashier may initiate a Stripe
  // payment for an invoice - matches the existing confirmPayment
  // endpoint's role restriction above, kept consistent rather than
  // widened to Manager/Admin as well.
  @Roles('CASHIER')
  @HttpCode(HttpStatus.CREATED)
  @Post('invoices/:id/create-payment-intent')
  async createPaymentIntent(@Param('id') id: string, @CurrentUser() cashierId: string) {
    return this.billingService.createPaymentIntent(id, cashierId);
  }

  // SECURITY (cite in report): this endpoint is @Public() - it is called
  // by Stripe's servers, not a logged-in user, so it cannot go through
  // the session-based SessionGuard. Its security comes entirely from
  // BillingService.handleStripeWebhook -> StripeService.constructWebhookEvent
  // verifying the 'stripe-signature' header against the raw request
  // body using our webhook signing secret (OWASP A08: Software and Data
  // Integrity Failures). req.rawBody is populated by main.ts's
  // rawBody:true app option - signature verification requires the exact
  // unparsed byte stream, not the JSON-parsed body.
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhooks/stripe')
  async handleStripeWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing raw body or Stripe-Signature header');
    }

    try {
      await this.billingService.handleStripeWebhook(req.rawBody, signature);
    } catch {
      // Signature verification failed - return 400, not 500, so this is
      // clearly distinguishable from an internal server error and so
      // Stripe's dashboard reports it as a client-side (our) rejection.
      throw new BadRequestException('Webhook signature verification failed');
    }

    return { received: true };
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

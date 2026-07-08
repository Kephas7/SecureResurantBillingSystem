import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, OrderStatus, Prisma, TableStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { generateInvoiceNumber } from '../../common/utils/invoice-number.util';
import { InventoryService } from '../inventory/inventory.service';
import { StripeService } from './stripe.service';
import { CreateInvoiceDto } from './billing.dto';

const BILLABLE_ORDER_STATUSES: OrderStatus[] = [OrderStatus.READY, OrderStatus.SERVED];

const INVOICE_INCLUDE = {
  order: {
    include: {
      table: true,
      items: { include: { menuItem: { select: { id: true, name: true } } } },
    },
  },
  createdBy: { select: { id: true, fullName: true, email: true } },
  refundRequests: true,
} satisfies Prisma.InvoiceInclude;

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly inventoryService: InventoryService,
    private readonly stripeService: StripeService,
  ) {}

  async createInvoice(dto: CreateInvoiceDto, cashierId: string): Promise<InvoiceWithRelations> {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { items: true, invoice: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!BILLABLE_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Cannot bill an order with status ${order.status}`);
    }

    if (order.invoice) {
      throw new ConflictException('Invoice already exists for this order');
    }

    // Monetary values are calculated using Prisma.Decimal throughout,
    // never JavaScript's floating-point number type, to avoid rounding
    // errors accumulating in stored financial figures.
    const subtotal = order.items.reduce(
      (sum, item) => sum.add(item.unitPrice.mul(item.quantity)),
      new Prisma.Decimal(0),
    );

    const taxRate = new Prisma.Decimal(process.env.TAX_RATE ?? '0.13');
    const taxAmount = subtotal.mul(taxRate).toDecimalPlaces(2);
    const discountAmount = new Prisma.Decimal(dto.discountAmount ?? 0);
    const totalAmount = subtotal.add(taxAmount).sub(discountAmount);

    if (totalAmount.lte(0)) {
      throw new BadRequestException('Discount cannot exceed subtotal plus tax');
    }

    const invoiceNumber = await generateInvoiceNumber(this.prisma);

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        orderId: dto.orderId,
        createdById: cashierId,
        subtotal,
        taxAmount,
        discountAmount,
        totalAmount,
        paymentMethod: dto.paymentMethod,
      },
      include: INVOICE_INCLUDE,
    });

    // Monetary values in audit metadata are stored as strings (e.g.
    // "142.50"), never numbers, to avoid floating-point representation
    // issues once this metadata round-trips through JSON.
    await this.auditLog.write(cashierId, 'INVOICE_CREATED', 'Invoice', invoice.id, {
      orderId: dto.orderId,
      totalAmount: totalAmount.toString(),
      paymentMethod: dto.paymentMethod,
    });

    return invoice;
  }

  async getInvoice(id: string): Promise<InvoiceWithRelations> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async getInvoiceByOrder(orderId: string): Promise<InvoiceWithRelations> {
    const invoice = await this.prisma.invoice.findUnique({ where: { orderId }, include: INVOICE_INCLUDE });
    if (!invoice) {
      throw new NotFoundException('No invoice exists for this order');
    }
    return invoice;
  }

  async findAll(page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        include: INVOICE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.invoice.count(),
    ]);

    return { data, page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) };
  }

  // SECURITY (cite in report): after paidAt is set, the invoice record
  // must never be directly mutated by any application code path. Any
  // financial adjustment after payment goes through the RefundRequest
  // flow, which requires Manager approval. This is enforced here by
  // checking status !== UNPAID before proceeding - not relying on the
  // controller or any other layer to prevent it. This implements
  // separation of duties and an immutable financial audit trail,
  // standard requirements in financial systems and aligned with the
  // PCI-DSS principle of audit log integrity.
  async confirmPayment(id: string, cashierId: string): Promise<InvoiceWithRelations> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: { order: true } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== InvoiceStatus.UNPAID) {
      throw new ConflictException('Invoice has already been paid');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: invoice.orderId }, data: { status: OrderStatus.BILLED } });

      // Table is now free - payment is the point at which the table
      // actually becomes available for the next guest, not order
      // creation or being marked SERVED (see Day 5 design decision).
      await tx.restaurantTable.update({ where: { id: invoice.order.tableId }, data: { status: TableStatus.AVAILABLE } });

      return tx.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.PAID, paidAt: new Date() },
        include: INVOICE_INCLUDE,
      });
    });

    // Inventory decrement failures must never block or roll back an
    // already-confirmed payment - the sale happened regardless of
    // whether stock bookkeeping succeeds. Any error here is logged and
    // swallowed, matching InventoryService.decrementForOrder's own
    // "log a warning, don't block" contract for negative-stock cases.
    try {
      await this.inventoryService.decrementForOrder(invoice.orderId);
    } catch (err: unknown) {
      this.logger.error(
        `Inventory decrement failed for order ${invoice.orderId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await this.auditLog.write(cashierId, 'PAYMENT_CONFIRMED', 'Invoice', id, {
      invoiceId: id,
      totalAmount: updated.totalAmount.toString(),
      paymentMethod: updated.paymentMethod,
    });

    return updated;
  }

  // SECURITY (cite in report): re-checks status server-side rather than
  // trusting the frontend to only call this for an UNPAID invoice - a
  // cashier retrying a stuck request must never be able to generate a
  // second, independent PaymentIntent for the same invoice. The
  // idempotency key in StripeService.createPaymentIntent (keyed on
  // invoiceId) additionally guarantees Stripe itself returns the same
  // PaymentIntent on a retry rather than creating a duplicate.
  async createPaymentIntent(invoiceId: string, cashierId: string): Promise<{ clientSecret: string }> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== InvoiceStatus.UNPAID) {
      throw new ConflictException('Invoice has already been paid');
    }

    const amountInCents = this.stripeService.toStripeCents(invoice.totalAmount.toString());
    const { clientSecret, paymentIntentId } = await this.stripeService.createPaymentIntent(invoiceId, amountInCents);

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { stripePaymentIntentId: paymentIntentId },
    });

    // clientSecret is returned to the caller only - it is never logged
    // or written to the audit trail, even though it is scoped to a
    // single PaymentIntent and cannot itself be used to create charges.
    await this.auditLog.write(cashierId, 'PAYMENT_INTENT_CREATED', 'Invoice', invoiceId, {
      paymentIntentId,
      amount: invoice.totalAmount.toString(),
    });

    return { clientSecret };
  }

  // SECURITY (cite in report): this is the only code path that marks an
  // invoice PAID as a result of a Stripe payment. It is only ever
  // reached via the webhook controller endpoint, after
  // StripeService.constructWebhookEvent has verified the event's
  // HMAC-SHA256 signature - never from a client-supplied request body.
  // (OWASP A08: Software and Data Integrity Failures)
  async handleStripeWebhook(payload: Buffer, signature: string): Promise<void> {
    const event = this.stripeService.constructWebhookEvent(payload, signature);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      default:
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  // SECURITY (cite in report): idempotent by design. Stripe only
  // guarantees "at-least-once" webhook delivery - the same
  // payment_intent.succeeded event can be delivered more than once
  // (e.g. Stripe retrying after a slow 2xx response from us). Checking
  // status !== UNPAID before running the settlement transaction turns a
  // duplicate delivery into a no-op instead of double-decrementing
  // inventory or re-writing paidAt.
  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { stripePaymentIntentId: paymentIntent.id },
      include: { order: true },
    });

    if (!invoice) {
      this.logger.warn(`Received payment_intent.succeeded for unknown PaymentIntent ${paymentIntent.id}`);
      return;
    }

    if (invoice.status !== InvoiceStatus.UNPAID) {
      this.logger.log(`Ignoring duplicate payment_intent.succeeded for already-settled invoice ${invoice.id}`);
      return;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: invoice.orderId }, data: { status: OrderStatus.BILLED } });

      // Table is now free - payment is the point at which the table
      // actually becomes available for the next guest (see confirmPayment).
      await tx.restaurantTable.update({ where: { id: invoice.order.tableId }, data: { status: TableStatus.AVAILABLE } });

      return tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.PAID, paidAt: new Date(), paymentMethod: 'STRIPE' },
        include: INVOICE_INCLUDE,
      });
    });

    // Inventory decrement failures must never block or roll back an
    // already-confirmed payment - see confirmPayment for the same
    // "log a warning, don't block" contract.
    try {
      await this.inventoryService.decrementForOrder(invoice.orderId);
    } catch (err: unknown) {
      this.logger.error(
        `Inventory decrement failed for order ${invoice.orderId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // actorId is null - this is a system event delivered by Stripe's
    // webhook, not an action taken by an authenticated user.
    await this.auditLog.write(null, 'PAYMENT_CONFIRMED', 'Invoice', invoice.id, {
      totalAmount: updated.totalAmount.toString(),
      paymentMethod: 'STRIPE',
      stripePaymentIntentId: paymentIntent.id,
    });
  }

  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (!invoice) {
      this.logger.warn(`Received payment_intent.payment_failed for unknown PaymentIntent ${paymentIntent.id}`);
      return;
    }

    // Invoice stays UNPAID so the cashier can retry payment - a
    // declined card attempt must never itself be treated as a
    // financial event or change invoice state.
    await this.auditLog.write(null, 'PAYMENT_FAILED', 'Invoice', invoice.id, {
      stripePaymentIntentId: paymentIntent.id,
      lastPaymentError: paymentIntent.last_payment_error?.message,
    });
  }

  async requestRefund(invoiceId: string, requestedById: string, reason: string, amount: number) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== InvoiceStatus.PAID) {
      throw new BadRequestException('Only paid invoices can be refunded');
    }

    const refundAmount = new Prisma.Decimal(amount);
    if (refundAmount.gt(invoice.totalAmount)) {
      throw new BadRequestException('Refund amount cannot exceed the invoice total');
    }

    const existingPending = await this.prisma.refundRequest.findFirst({
      where: { invoiceId, status: 'PENDING' },
    });
    if (existingPending) {
      throw new ConflictException('A pending refund request already exists for this invoice');
    }

    const refund = await this.prisma.refundRequest.create({
      data: { invoiceId, requestedById, reason, amount: refundAmount },
    });

    await this.auditLog.write(requestedById, 'REFUND_REQUESTED', 'RefundRequest', refund.id, {
      invoiceId,
      amount: refundAmount.toString(),
      reason,
    });

    return refund;
  }

  // Refund approval is a separate step requiring a different role
  // (Manager/Admin) from the one who created the invoice (Cashier) -
  // separation of duties: no single person can both create and approve
  // a financial reversal, mitigating insider fraud risk. The approver's
  // role is re-fetched from the database here rather than trusted from
  // the request context - the @Roles() decorator on the controller is
  // only a coarse first filter, this is the authoritative check.
  async approveRefund(refundRequestId: string, managerId: string) {
    await this.assertIsManagerOrAdmin(managerId);

    const refund = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { invoice: true },
    });
    if (!refund) {
      throw new NotFoundException('Refund request not found');
    }

    if (refund.status !== 'PENDING') {
      throw new ConflictException('Refund request has already been decided');
    }

    // SECURITY FIX — FINDING-001
    // Separation of duties: the person who requested the refund
    // cannot be the same person who approves it.
    // This prevents a single Manager from both initiating and
    // authorising a financial reversal without a second pair of eyes.
    // (PCI-DSS Requirement 6.3 — separation of duties;
    //  OWASP Testing Guide — Business Logic Testing OTG-BUSLOGIC-008)
    if (refund.requestedById === managerId) {
      throw new ForbiddenException(
        'You cannot approve a refund that you requested. ' +
          'Another manager or admin must approve it.',
      );
    }

    const newInvoiceStatus = refund.amount.equals(refund.invoice.totalAmount)
      ? InvoiceStatus.REFUNDED
      : InvoiceStatus.PARTIALLY_REFUNDED;

    await this.prisma.$transaction([
      this.prisma.refundRequest.update({
        where: { id: refundRequestId },
        data: { status: 'APPROVED', approvedById: managerId, decidedAt: new Date() },
      }),
      this.prisma.invoice.update({ where: { id: refund.invoiceId }, data: { status: newInvoiceStatus } }),
    ]);

    await this.auditLog.write(managerId, 'REFUND_APPROVED', 'RefundRequest', refundRequestId, {
      amount: refund.amount.toString(),
      approvedById: managerId,
    });

    return { message: 'Refund approved' };
  }

  async rejectRefund(refundRequestId: string, managerId: string) {
    await this.assertIsManagerOrAdmin(managerId);

    const refund = await this.prisma.refundRequest.findUnique({ where: { id: refundRequestId } });
    if (!refund) {
      throw new NotFoundException('Refund request not found');
    }

    if (refund.status !== 'PENDING') {
      throw new ConflictException('Refund request has already been decided');
    }

    await this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: { status: 'REJECTED', approvedById: managerId, decidedAt: new Date() },
    });

    await this.auditLog.write(managerId, 'REFUND_REJECTED', 'RefundRequest', refundRequestId, {
      reason: refund.reason,
    });

    return { message: 'Refund rejected' };
  }

  async getPendingRefunds() {
    return this.prisma.refundRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getDecidedRefunds(limit: number) {
    return this.prisma.refundRequest.findMany({
      where: { status: { in: ['APPROVED', 'REJECTED'] } },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } },
      },
      orderBy: { decidedAt: 'desc' },
      take: limit,
    });
  }

  private async assertIsManagerOrAdmin(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } } },
    });
    if (!user || (user.role.name !== 'MANAGER' && user.role.name !== 'ADMIN')) {
      throw new ForbiddenException('Only Managers or Admins can approve or reject refunds');
    }
  }
}

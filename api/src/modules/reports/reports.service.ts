import { BadRequestException, Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma, RefundStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface DateRange {
  start: Date;
  end: Date;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSalesReport(startDate: string, endDate: string) {
    const { start, end } = this.parseRange(startDate, endDate);

    const invoices = await this.prisma.invoice.findMany({
      where: { status: InvoiceStatus.PAID, paidAt: { gte: start, lte: end } },
      include: { order: { include: { items: { include: { menuItem: true } } } } },
    });

    const totalRevenue = invoices.reduce((sum, invoice) => sum.add(invoice.totalAmount), new Prisma.Decimal(0));
    const totalInvoices = invoices.length;
    // Invoice.orderId is unique (one invoice per order), so counting
    // paid invoices and counting the orders they bill is equivalent -
    // reported as a separate field for report readability, not because
    // the numbers can differ under this schema.
    const totalOrders = totalInvoices;
    const averageOrderValue = totalInvoices > 0 ? totalRevenue.div(totalInvoices) : new Prisma.Decimal(0);

    const revenueByDay = this.buildRevenueByDay(start, end, invoices);
    const topMenuItems = this.buildTopMenuItems(invoices);
    const paymentMethodBreakdown = this.buildPaymentMethodBreakdown(invoices);

    return {
      totalRevenue: totalRevenue.toString(),
      totalInvoices,
      totalOrders,
      averageOrderValue: averageOrderValue.toDecimalPlaces(2).toString(),
      revenueByDay,
      topMenuItems,
      paymentMethodBreakdown,
    };
  }

  async getInventoryReport() {
    const ingredients = await this.prisma.ingredient.findMany({
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    const lowStockItems = ingredients.filter((ingredient) => ingredient.stockQuantity.lte(ingredient.lowStockThreshold));
    const outOfStockItems = ingredients.filter((ingredient) => ingredient.stockQuantity.equals(0));

    return {
      totalIngredients: ingredients.length,
      lowStockItems,
      outOfStockItems,
    };
  }

  // Staff reports are Manager/Admin only. Exposing individual
  // performance metrics to other staff would be an unnecessary data
  // disclosure. Role enforcement is at both the controller (@Roles) and
  // - since this service has no method that skips the controller - no
  // override path exists to reach this data without that check.
  async getStaffReport(startDate: string, endDate: string) {
    const { start, end } = this.parseRange(startDate, endDate);

    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        invoice: { select: { status: true, totalAmount: true } },
      },
    });

    const statsByWaiter = new Map<string, { waiterName: string; orderCount: number; totalRevenue: Prisma.Decimal }>();

    for (const order of orders) {
      const existing = statsByWaiter.get(order.createdById) ?? {
        waiterName: order.createdBy.fullName,
        orderCount: 0,
        totalRevenue: new Prisma.Decimal(0),
      };

      existing.orderCount += 1;

      if (order.invoice && order.invoice.status !== InvoiceStatus.VOID) {
        existing.totalRevenue = existing.totalRevenue.add(order.invoice.totalAmount);
      }

      statsByWaiter.set(order.createdById, existing);
    }

    const ordersPerWaiter = Array.from(statsByWaiter.entries())
      .map(([waiterId, stats]) => ({
        waiterId,
        waiterName: stats.waiterName,
        orderCount: stats.orderCount,
        totalRevenue: stats.totalRevenue.toString(),
      }))
      .sort((a, b) => b.orderCount - a.orderCount);

    return { ordersPerWaiter };
  }

  async getRefundReport(startDate: string, endDate: string) {
    const { start, end } = this.parseRange(startDate, endDate);

    const [approvedRefunds, allRefundsInRange, pendingRefunds] = await Promise.all([
      this.prisma.refundRequest.findMany({
        where: { status: RefundStatus.APPROVED, decidedAt: { gte: start, lte: end } },
      }),
      this.prisma.refundRequest.findMany({
        where: { createdAt: { gte: start, lte: end } },
      }),
      this.prisma.refundRequest.count({ where: { status: RefundStatus.PENDING } }),
    ]);

    const totalRefundAmount = approvedRefunds.reduce((sum, refund) => sum.add(refund.amount), new Prisma.Decimal(0));

    const refundsByReason = new Map<string, number>();
    for (const refund of allRefundsInRange) {
      refundsByReason.set(refund.reason, (refundsByReason.get(refund.reason) ?? 0) + 1);
    }

    return {
      totalRefunds: approvedRefunds.length,
      totalRefundAmount: totalRefundAmount.toString(),
      refundsByReason: Array.from(refundsByReason.entries()).map(([reason, count]) => ({ reason, count })),
      pendingRefunds,
    };
  }

  private parseRange(startDate: string, endDate: string): DateRange {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    // Treat endDate as inclusive through the end of that calendar day,
    // so a report for "today" includes sales made at any time today.
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  private buildRevenueByDay(
    start: Date,
    end: Date,
    invoices: { paidAt: Date | null; totalAmount: Prisma.Decimal }[],
  ): { date: string; revenue: string }[] {
    const revenueByDate = new Map<string, Prisma.Decimal>();

    for (const invoice of invoices) {
      if (!invoice.paidAt) continue;
      const dateKey = invoice.paidAt.toISOString().slice(0, 10);
      revenueByDate.set(dateKey, (revenueByDate.get(dateKey) ?? new Prisma.Decimal(0)).add(invoice.totalAmount));
    }

    const days: { date: string; revenue: string }[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= end.getTime()) {
      const dateKey = cursor.toISOString().slice(0, 10);
      days.push({ date: dateKey, revenue: (revenueByDate.get(dateKey) ?? new Prisma.Decimal(0)).toString() });
      cursor.setDate(cursor.getDate() + 1);
    }

    return days;
  }

  private buildTopMenuItems(
    invoices: {
      order: { items: { menuItemId: string; quantity: number; unitPrice: Prisma.Decimal; menuItem: { name: string } }[] };
    }[],
  ): { menuItemId: string; name: string; quantitySold: number; revenueContribution: string }[] {
    const statsByItem = new Map<string, { name: string; quantitySold: number; revenue: Prisma.Decimal }>();

    for (const invoice of invoices) {
      for (const item of invoice.order.items) {
        const existing = statsByItem.get(item.menuItemId) ?? {
          name: item.menuItem.name,
          quantitySold: 0,
          revenue: new Prisma.Decimal(0),
        };
        existing.quantitySold += item.quantity;
        existing.revenue = existing.revenue.add(item.unitPrice.mul(item.quantity));
        statsByItem.set(item.menuItemId, existing);
      }
    }

    return Array.from(statsByItem.entries())
      .map(([menuItemId, stats]) => ({
        menuItemId,
        name: stats.name,
        quantitySold: stats.quantitySold,
        revenueContribution: stats.revenue.toString(),
      }))
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 10);
  }

  private buildPaymentMethodBreakdown(invoices: { paymentMethod: string | null }[]): Record<string, number> {
    const breakdown: Record<string, number> = { CASH: 0, CARD: 0, MOBILE: 0 };

    for (const invoice of invoices) {
      if (invoice.paymentMethod && invoice.paymentMethod in breakdown) {
        breakdown[invoice.paymentMethod] += 1;
      }
    }

    return breakdown;
  }
}

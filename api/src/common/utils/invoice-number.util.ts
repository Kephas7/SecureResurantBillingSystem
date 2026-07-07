import { PrismaService } from '../../modules/prisma/prisma.service';

// Invoice numbers are sequential and human-readable for operational use
// (printed receipts, phone support, bookkeeping). They are NOT used as
// security identifiers - all security checks (ownership, IDOR
// protection, lookups) use the UUID primary key. Sequential invoice
// numbers are intentionally predictable; this is normal in accounting
// systems and is not itself a vulnerability as long as nothing sensitive
// is gated on guessing one.
export async function generateInvoiceNumber(prisma: PrismaService): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count();
  const sequence = String(count + 1).padStart(6, '0');
  return `INV-${year}-${sequence}`;
}

import type { Prisma } from '@prisma/client';

/**
 * Allocates a sequential, gapless invoice number: INV-2026-000001.
 *
 * Must be called with the same transaction client that creates the Invoice row. The upsert's
 * row lock serialises concurrent allocations, and because the increment lives inside the
 * caller's transaction, a rolled-back invoice returns its number instead of burning it — which
 * is what "gapless" requires for GST. Never call this outside a transaction, and never
 * pre-allocate a number to use later.
 *
 * Format confirmed with the client: calendar year, 6-digit zero-padded counter, 15 characters
 * (GST caps invoice numbers at 16).
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();

  const seq = await tx.invoiceNumberSequence.upsert({
    where: { year },
    create: { year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });

  return `INV-${year}-${String(seq.lastValue).padStart(6, '0')}`;
}

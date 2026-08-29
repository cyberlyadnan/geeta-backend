import type { Prisma } from '@prisma/client';

/**
 * Gapless per-year ticket counter — SR/2026/000001.
 *
 * Same upsert+increment pattern as orders and invoices: the row lock serialises concurrent
 * allocations, and because the increment runs inside the caller's transaction a rollback returns
 * the number instead of burning it. Gaplessness matters less here than on an invoice, but a
 * vendor quoting "ticket 41" to someone on the phone should always find ticket 41.
 */
export async function allocateTicketNumber(tx: Prisma.TransactionClient, date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const row = await tx.supportTicketNumberSequence.upsert({
    where: { year },
    create: { year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
    select: { lastValue: true },
  });
  return `SR/${String(year)}/${String(row.lastValue).padStart(6, '0')}`;
}

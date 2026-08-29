import type { Prisma } from '@prisma/client';

/** Voucher series prefixes. One counter per series per fiscal year. */
export const VOUCHER_SERIES = {
  JOURNAL: 'JV',
  SALES: 'SV',
  RECEIPT: 'RV',
  PAYMENT: 'PV',
  CREDIT_NOTE: 'CN',
  EXPENSE: 'EXP',
  PURCHASE: 'PB',
  CONTRA: 'CV',
} as const;

export type VoucherSeries = (typeof VOUCHER_SERIES)[keyof typeof VOUCHER_SERIES];

/**
 * Gapless per-series, per-fiscal-year counter — the same upsert+increment pattern the order and
 * invoice sequences already use. The row lock serialises concurrent allocations, and because the
 * increment runs inside the caller's transaction, a rollback returns the number rather than
 * burning it. Gaplessness matters here: a CA reading a voucher register treats a missing number
 * as a deleted entry.
 */
export async function allocateVoucherNumber(
  tx: Prisma.TransactionClient,
  series: VoucherSeries,
  fiscalYear: number,
): Promise<string> {
  const key = `${series}-${String(fiscalYear)}`;
  const row = await tx.voucherNumberSequence.upsert({
    where: { key },
    create: { key, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
    select: { lastValue: true },
  });
  const shortYear = `${String(fiscalYear).slice(2)}${String((fiscalYear + 1) % 100).padStart(2, '0')}`;
  return `${series}/${shortYear}/${String(row.lastValue).padStart(6, '0')}`;
}

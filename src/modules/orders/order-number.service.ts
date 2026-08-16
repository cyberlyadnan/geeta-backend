import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

/** "GP" (vendor/self-serve) is the default — every existing caller keeps producing GP-2026-000001
 *  unchanged. "RC" (retail/local counter orders) gets its own independent counter. */
export type OrderNumberPrefix = 'GP' | 'RC';

/**
 * Generates sequential human-readable order numbers, one counter per (year, prefix):
 * GP-2026-000001 for vendor/self-serve orders, RC-2026-000001 for local/retail counter orders.
 * Race-safe under concurrent creation via the same upsert + increment pattern as before.
 */
export async function allocateOrderNumber(
  tx?: Prisma.TransactionClient,
  prefix: OrderNumberPrefix = 'GP',
): Promise<string> {
  const year = new Date().getFullYear();
  const db = tx ?? prisma;

  const seq = await db.orderNumberSequence.upsert({
    where: { year_prefix: { year, prefix } },
    create: { year, prefix, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });

  return `${prefix}-${year}-${String(seq.lastValue).padStart(6, '0')}`;
}

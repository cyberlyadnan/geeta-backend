import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

/**
 * Generates sequential human-readable order numbers: GP-2026-000001
 */
export async function allocateOrderNumber(tx?: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const db = tx ?? prisma;

  const seq = await db.orderNumberSequence.upsert({
    where: { year },
    create: { year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });

  return `GP-${year}-${String(seq.lastValue).padStart(6, '0')}`;
}

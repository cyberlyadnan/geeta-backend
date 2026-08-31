import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

/** @deprecated Prefix is ignored — all production orders share one numeric sequence. */
export type OrderNumberPrefix = 'GP' | 'RC';

/** Global sequence key — one counter for every production order (vendor + retail). */
export const ORDER_NUMBER_SEQUENCE = { year: 0, prefix: 'ORDER' } as const;

export const ORDER_NUMBER_PAD_LENGTH = 6;

/**
 * Allocates the next production order number as a zero-padded integer: 000001, 000002, …
 * Race-safe via upsert + increment on `order_number_sequences`.
 */
export async function allocateOrderNumber(
  tx?: Prisma.TransactionClient,
  _legacyPrefix?: OrderNumberPrefix,
): Promise<string> {
  const db = tx ?? prisma;
  const { year, prefix } = ORDER_NUMBER_SEQUENCE;

  const seq = await db.orderNumberSequence.upsert({
    where: { year_prefix: { year, prefix } },
    create: { year, prefix, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });

  return String(seq.lastValue).padStart(ORDER_NUMBER_PAD_LENGTH, '0');
}

/** Normalize user input / legacy stored values to digits for lookup. */
export function normalizeOrderNumberInput(value: string): string {
  const trimmed = value.trim();
  const legacy = trimmed.match(/^(?:GP|RC)-\d{4}-(\d+)$/i);
  if (legacy?.[1]) return legacy[1].padStart(ORDER_NUMBER_PAD_LENGTH, '0');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;
  return digits.padStart(ORDER_NUMBER_PAD_LENGTH, '0');
}

/** Search by legacy prefixed numbers or plain digits after migration. */
export function orderNumberSearchConditions(search: string): Array<
  { orderNumber: { contains: string; mode: 'insensitive' } } | { orderNumber: string }
> {
  const trimmed = search.trim();
  if (!trimmed) return [];
  const normalized = normalizeOrderNumberInput(trimmed);
  const conditions: Array<
    { orderNumber: { contains: string; mode: 'insensitive' } } | { orderNumber: string }
  > = [{ orderNumber: { contains: trimmed, mode: 'insensitive' } }];
  if (normalized !== trimmed) {
    conditions.push({ orderNumber: normalized });
  }
  return conditions;
}

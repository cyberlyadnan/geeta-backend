import type { VendorPriceOverrideType } from '@prisma/client';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface VendorPriceOverrideRecord {
  id: string;
  matrixCellId: string | null;
  overrideType: VendorPriceOverrideType;
  /** Already converted from Prisma.Decimal — see vendor-price-override.repository.ts. */
  value: number;
}

/**
 * Effective price after an override. REPLACE uses value directly; DELTA adds to list; PERCENT
 * adjusts list by signed percentage points (−5 = 5% off, +5 = 5% on). Returns null when list is
 * unknown and the override type needs it.
 */
export function computeEffectiveOverridePrice(
  listPrice: number | null,
  overrideType: VendorPriceOverrideType,
  value: number,
): number | null {
  if (overrideType === 'REPLACE') return value;
  if (listPrice == null) return null;
  if (overrideType === 'DELTA') return round2(listPrice + value);
  if (overrideType === 'PERCENT') return round2(listPrice * (1 + value / 100));
  return listPrice;
}

/**
 * Applies a (possibly absent) vendor-negotiated override to a list price. REPLACE substitutes
 * the list price outright; DELTA adds/subtracts from it; PERCENT adjusts by signed percentage points
 * (−5 = 5% off, +5 = 5% on). Returns the list price unchanged when there is no override.
 */
export function applyVendorOverride(
  listPrice: number,
  override: VendorPriceOverrideRecord | null,
): number {
  if (!override) return listPrice;
  return computeEffectiveOverridePrice(listPrice, override.overrideType, override.value) ?? listPrice;
}

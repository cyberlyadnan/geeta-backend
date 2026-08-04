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
 * Applies a (possibly absent) vendor-negotiated override to a list price. REPLACE substitutes
 * the list price outright; DELTA adds/subtracts from it. Returns the list price unchanged when
 * there is no override — the sparse-override, fall-through-to-default behavior non-negotiable #2
 * requires.
 */
export function applyVendorOverride(
  listPrice: number,
  override: VendorPriceOverrideRecord | null,
): number {
  if (!override) return listPrice;
  return override.overrideType === 'REPLACE' ? override.value : round2(listPrice + override.value);
}

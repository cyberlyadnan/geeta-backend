import type { Prisma } from '@prisma/client';
import { decimalToNumber } from '../../utils/money.js';
import type { PriceBreakdownLine, ProductSelection } from './pricing.types.js';

export interface PriceMatrixCellRecord {
  id: string;
  dimensionKey: Prisma.JsonValue;
  dimensionKeyHash: string;
  price: Prisma.Decimal | null;
  available: boolean;
  unavailableReason: string | null;
}

export interface PriceModifierRuleRecord {
  id: string;
  name: string;
  triggerField: string;
  triggerValue: string;
  amountKey: string;
  amountTable: Prisma.JsonValue;
  appliesAfter: string;
}

export interface QuantityBand {
  /** Inclusive lower bound — also the underlying QuantityPricing.quantity this band reuses. */
  lowerBound: number;
  /** Inclusive upper bound, or null when this is the open-ended top band. */
  upperBound: number | null;
  /** Display/lookup label, e.g. "1-5" or "1000+". */
  label: string;
}

export interface MatrixResolution {
  valid: boolean;
  reason?: string;
  price?: number;
  cellId?: string;
  dimensionKey?: Record<string, string>;
  qtyBand?: string;
}

/**
 * Canonical, order-independent string form of a dimension key — this is what uniqueness and
 * lookups key off, since Postgres has no default btree operator class for jsonb.
 */
export function buildDimensionKeyHash(dimensionKey: Record<string, string | number>): string {
  return Object.keys(dimensionKey)
    .sort()
    .map((key) => `${key}=${String(dimensionKey[key])}`)
    .join('&');
}

/**
 * Bands reuse existing QuantityPricing tier rows as their lower bounds (same admin-managed data,
 * same "exact or nearest lower" resolution the rest of the engine already uses) — a band's upper
 * bound is simply the next tier's lower bound minus one, or open-ended for the highest tier.
 */
export function buildQuantityBands(
  tiers: Array<{ quantity: number; isActive: boolean }>,
): QuantityBand[] {
  const active = tiers.filter((t) => t.isActive).sort((a, b) => a.quantity - b.quantity);
  return active.map((tier, index) => {
    const next = active[index + 1];
    const upperBound = next ? next.quantity - 1 : null;
    const label = upperBound == null ? `${tier.quantity}+` : `${tier.quantity}-${upperBound}`;
    return { lowerBound: tier.quantity, upperBound, label };
  });
}

export function resolveQuantityBand(bands: QuantityBand[], quantity: number): QuantityBand | null {
  if (bands.length === 0) return null;
  const match = bands.find(
    (b) => quantity >= b.lowerBound && (b.upperBound == null || quantity <= b.upperBound),
  );
  if (match) return match;
  // Below the lowest configured band — fall back to the lowest band, mirroring
  // resolveQuantityTier()'s "below minimum tier uses lowest tier" behavior.
  return bands[0]!;
}

/**
 * Learns which configuration-field codes this product's matrix is keyed by, from the cells
 * themselves (never hardcoded) — also used by the vendor-facing availability endpoint so the
 * wizard can grey out combinations without re-deriving this from scratch.
 */
export function inferDimensionFields(cells: PriceMatrixCellRecord[]): string[] | null {
  const first = cells[0];
  if (!first || typeof first.dimensionKey !== 'object' || first.dimensionKey === null) return null;
  return Object.keys(first.dimensionKey as Record<string, unknown>).filter((k) => k !== 'qtyBand');
}

/**
 * Resolves the "matrix" strategy base price: a direct cell lookup keyed by whichever dimension
 * fields this product's matrix was configured with, plus a quantity band. Dimensions are never
 * hardcoded (no "gsm"/"sheetSize" in code) — the field set is learned from the cells themselves,
 * so the same resolver works for any N-dimensional matrix.
 */
export function resolveMatrixPrice(
  cells: PriceMatrixCellRecord[],
  quantityTiers: Array<{ quantity: number; isActive: boolean }>,
  selections: ProductSelection,
  quantity: number,
): MatrixResolution {
  const dimensionFields = inferDimensionFields(cells);
  if (!dimensionFields) {
    return { valid: false, reason: 'Pricing matrix is not configured for this product yet' };
  }

  const bands = buildQuantityBands(quantityTiers);
  const band = resolveQuantityBand(bands, quantity);
  if (!band) {
    return { valid: false, reason: 'No quantity bands configured for this product' };
  }

  const dimensionKey: Record<string, string> = { qtyBand: band.label };
  for (const field of dimensionFields) {
    const value = selections[field];
    if (!value) {
      return { valid: false, reason: `"${field}" must be selected to price this product` };
    }
    dimensionKey[field] = value;
  }

  const hash = buildDimensionKeyHash(dimensionKey);
  const cell = cells.find((c) => c.dimensionKeyHash === hash);

  if (!cell || !cell.available || cell.price == null) {
    return {
      valid: false,
      reason: cell?.unavailableReason ?? 'This combination is not available',
      dimensionKey,
      qtyBand: band.label,
    };
  }

  return {
    valid: true,
    price: decimalToNumber(cell.price),
    cellId: cell.id,
    dimensionKey,
    qtyBand: band.label,
  };
}

/**
 * Applies conditional PriceModifierRules (e.g. a B/S surcharge whose amount depends on which
 * GSM is selected) on top of a resolved base price.
 */
export function applyPriceModifierRules(
  basePrice: number,
  rules: PriceModifierRuleRecord[],
  selections: ProductSelection,
): { total: number; lines: PriceBreakdownLine[] } {
  let total = basePrice;
  const lines: PriceBreakdownLine[] = [];

  for (const rule of rules) {
    if (selections[rule.triggerField] !== rule.triggerValue) continue;

    const amountKeyValue = selections[rule.amountKey];
    const table =
      rule.amountTable && typeof rule.amountTable === 'object' && !Array.isArray(rule.amountTable)
        ? (rule.amountTable as Record<string, unknown>)
        : {};
    const rawAmount = amountKeyValue != null ? table[amountKeyValue] : undefined;
    const amount = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount) || 0;

    total += amount;
    lines.push({
      code: `modifier:${rule.id}`,
      label: rule.name,
      type: 'rule',
      amount,
    });
  }

  return { total, lines };
}

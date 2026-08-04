function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Converts a dimension in the given unit to feet — resolveChargeableSize works in feet throughout. */
export function toFeet(value: number, unit: string | null | undefined): number {
  switch ((unit ?? 'MM').toUpperCase()) {
    case 'CM':
      return value / 30.48;
    case 'INCH':
      return value / 12;
    case 'FT':
      return value;
    case 'MM':
    default:
      return value / 304.8;
  }
}

export interface ChargeableSizeResolution {
  valid: boolean;
  reason?: string;
  chargedWidth?: number;
  chargedLength?: number;
  chargedArea?: number;
  price?: number;
  wasRounded?: boolean;
}

/** First available width (ascending) that is >= dimension, or null if every width is exceeded. */
function smallestAvailableWidth(dimension: number, sortedWidths: number[]): number | null {
  for (const width of sortedWidths) {
    if (width >= dimension) return width;
  }
  return null;
}

/**
 * Resolves the chargeable (billed) size for a roll/flex product: tries both orientations of the
 * uploaded design against the fixed set of available roll widths, rounds up to the smallest
 * available width that fits, and picks whichever valid orientation bills the smaller area.
 * All dimensions are in feet. Pure function — no I/O, no rounding of money beyond 2dp.
 */
export function resolveChargeableSize(
  uploadedWidth: number,
  uploadedHeight: number,
  availableWidths: number[],
  ratePerSqFt: number,
): ChargeableSizeResolution {
  const sorted = [...availableWidths].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { valid: false, reason: 'No roll widths configured for this product' };
  }
  const maxWidth = sorted[sorted.length - 1]!;

  // Try both orientations: which uploaded dimension acts as the "roll-width side".
  const orientationA = smallestAvailableWidth(uploadedWidth, sorted); // width-constrained
  const orientationB = smallestAvailableWidth(uploadedHeight, sorted); // height-constrained

  if (orientationA == null && orientationB == null) {
    const shorterSide = Math.min(uploadedWidth, uploadedHeight);
    return {
      valid: false,
      reason:
        `Maximum available width for this product is ${maxWidth} ft. Your design's shorter side ` +
        `is ${shorterSide} ft, which exceeds this. Please resize your design or choose a ` +
        `different material.`,
    };
  }

  const candidates: Array<{ chargedWidth: number; chargedLength: number; matchesWidthSide: boolean }> = [];
  if (orientationA != null) {
    candidates.push({ chargedWidth: orientationA, chargedLength: uploadedHeight, matchesWidthSide: true });
  }
  if (orientationB != null) {
    candidates.push({ chargedWidth: orientationB, chargedLength: uploadedWidth, matchesWidthSide: false });
  }

  // Cheapest valid option.
  const chosen = candidates.reduce((best, candidate) =>
    candidate.chargedWidth * candidate.chargedLength < best.chargedWidth * best.chargedLength
      ? candidate
      : best,
  );

  const chargedArea = round2(chosen.chargedWidth * chosen.chargedLength);
  const price = round2(chargedArea * ratePerSqFt);
  const originalMatchingDimension = chosen.matchesWidthSide ? uploadedWidth : uploadedHeight;
  const wasRounded = chosen.chargedWidth !== originalMatchingDimension;

  return {
    valid: true,
    chargedWidth: chosen.chargedWidth,
    chargedLength: chosen.chargedLength,
    chargedArea,
    price,
    wasRounded,
  };
}

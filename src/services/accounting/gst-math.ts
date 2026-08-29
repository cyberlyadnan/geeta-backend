/**
 * Pure GST arithmetic — no database, no settings, no I/O.
 *
 * Kept separate from `gst.service.ts` so the arithmetic that decides what a customer is charged
 * can be unit-tested directly, without a database. The service layer above adds the parts that
 * need context (the company's home state, the B2CL threshold) and delegates the maths here.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** The first two digits of a GSTIN are its state code. */
export function stateCodeFromGstin(gstin?: string | null): string | null {
  if (!gstin) return null;
  const trimmed = gstin.trim();
  if (trimmed.length < 2) return null;
  const code = trimmed.slice(0, 2);
  return /^\d{2}$/.test(code) ? code : null;
}

/** Structural validity only — this is not a GSTN lookup. 22AAAAA0000A1Z5 */
export function isStructurallyValidGstin(gstin: string): boolean {
  return /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(gstin.trim().toUpperCase());
}

export interface RateSplit {
  cgst: number;
  sgst: number;
  igst: number;
}

/**
 * Splits a tax amount into CGST/SGST (intra-state) or IGST (inter-state).
 *
 * The halves are taken from the *total tax* rather than by halving the rate: halving the rate and
 * rounding twice opens a paisa gap on odd amounts, and then the invoice total does not match the
 * sum of its own tax lines.
 */
export function splitTaxAmount(totalTax: number, isIntraState: boolean): RateSplit {
  if (totalTax === 0) return { cgst: 0, sgst: 0, igst: 0 };
  if (!isIntraState) return { cgst: 0, sgst: 0, igst: round2(totalTax) };
  const cgst = round2(totalTax / 2);
  // The remainder, not a second rounding — guarantees cgst + sgst === totalTax exactly.
  return { cgst, sgst: round2(totalTax - cgst), igst: 0 };
}

export function taxOn(taxableValue: number, ratePercent: number): number {
  return round2((taxableValue * ratePercent) / 100);
}

/**
 * Spreads a total across lines by weight, with the remainder on the last line so the parts always
 * add back to the whole. This is the standard treatment and the one a CA expects to see.
 */
export function apportion(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0) return weights.map(() => 0);

  const out: number[] = [];
  let allocated = 0;
  for (let index = 0; index < weights.length; index += 1) {
    if (index === weights.length - 1) {
      out.push(round2(total - allocated));
    } else {
      const share = round2((total * (weights[index]!)) / weightSum);
      out.push(share);
      allocated = round2(allocated + share);
    }
  }
  return out;
}

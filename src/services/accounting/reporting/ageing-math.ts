export interface Movement {
  date: Date;
  amount: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Applies received money against outstanding charges oldest-first.
 *
 * Pure and exported because this is the one piece of ageing that is genuinely easy to get wrong,
 * and getting it wrong produces a report that looks plausible while telling a customer their
 * six-month-old bill is current. FIFO is also what a collections conversation actually assumes —
 * "your July bill is still open" means the July bill, not a share of every bill.
 */
export function applyPaymentsFifo(movements: Movement[]): Movement[] {
  const charges: Movement[] = [];
  let credit = 0;

  for (const movement of movements) {
    if (movement.amount > 0) charges.push({ ...movement });
    else credit = round2(credit + Math.abs(movement.amount));
  }

  for (const charge of charges) {
    if (credit <= 0) break;
    const applied = Math.min(credit, charge.amount);
    charge.amount = round2(charge.amount - applied);
    credit = round2(credit - applied);
  }

  // Anything under half a paisa is rounding noise, not a debt.
  return charges.filter((charge) => charge.amount > 0.009);
}

export const AGEING_BUCKETS: { label: string; from: number; to: number | null }[] = [
  { label: 'Not due / 0-30 days', from: 0, to: 30 },
  { label: '31-60 days', from: 31, to: 60 },
  { label: '61-90 days', from: 61, to: 90 },
  { label: '91-180 days', from: 91, to: 180 },
  { label: 'Over 180 days', from: 181, to: null },
];

export function bucketIndexForDays(days: number): number {
  for (let i = 0; i < AGEING_BUCKETS.length; i += 1) {
    const def = AGEING_BUCKETS[i]!;
    if (def.to === null || days <= def.to) return i;
  }
  return AGEING_BUCKETS.length - 1;
}

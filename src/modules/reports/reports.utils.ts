import type { GroupedAmountRow } from './reports.types.js';

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Turns a keyed map of {amount,count} into ranked rows with each row's share of the total. */
export function toGroupedRows(
  buckets: Map<string, { label: string; amount: number; count: number }>,
): GroupedAmountRow[] {
  const rows = [...buckets.entries()].map(([key, value]) => ({ key, ...value }));
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return rows
    .map((row) => ({
      ...row,
      amount: round2(row.amount),
      percentage: total === 0 ? 0 : round2((row.amount / total) * 100),
    }))
    .sort((a, b) => b.amount - a.amount);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(date: Date): string {
  return `${MONTHS[date.getMonth()] ?? ''} ${String(date.getFullYear())}`;
}

/**
 * Purchase module helpers.
 *
 * Amount arithmetic deliberately lives in the service next to the transaction that persists it —
 * splitting money maths across files is how a rounding rule ends up applied twice.
 */
export function outstandingOf(total: number, paid: number): number {
  return Math.round((total - paid + Number.EPSILON) * 100) / 100;
}

export function overdueDays(dueDate: Date, asAt: Date = new Date()): number {
  return Math.max(0, Math.floor((asAt.getTime() - dueDate.getTime()) / 86_400_000));
}

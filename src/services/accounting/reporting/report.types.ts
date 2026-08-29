export interface DateRange {
  from: Date;
  to: Date;
}

export interface AccountBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  subType: string;
  debit: number;
  credit: number;
  /** Signed by the account's normal balance: positive means "as expected". */
  balance: number;
}

export interface ReportSection<T = AccountBalanceRow> {
  key: string;
  title: string;
  rows: T[];
  total: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Start-of-day / end-of-day so a caller passing plain dates gets the whole day. */
export function normaliseRange(from?: Date, to?: Date): DateRange {
  const start = from ? new Date(from) : new Date(0);
  const end = to ? new Date(to) : new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { from: start, to: end };
}

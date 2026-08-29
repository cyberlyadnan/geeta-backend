/**
 * Pure fiscal-calendar maths — no database.
 *
 * The March/April boundary is where Indian accounting software goes wrong: a bill dated 31 March
 * 2027 belongs to FY 2026-27, not 2027-28, and getting that wrong misfiles a whole month of
 * revenue. Isolating the arithmetic here makes it directly testable.
 */

export interface FiscalCoordinates {
  /** Starting calendar year of the fiscal year — 2026 for FY 2026-27. */
  fiscalYear: number;
  /** 1 = the first month of the fiscal year (April in India), 12 = the last. */
  fiscalPeriod: number;
  label: string;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function coordinatesFor(date: Date, fiscalYearStartMonth: number): FiscalCoordinates {
  const month = date.getMonth() + 1; // 1-12 calendar
  const year = date.getFullYear();
  const fiscalYear = month >= fiscalYearStartMonth ? year : year - 1;
  const fiscalPeriod = ((month - fiscalYearStartMonth + 12) % 12) + 1;
  return { fiscalYear, fiscalPeriod, label: `${MONTH_NAMES[month - 1] ?? ''} ${String(year)}` };
}

/** "2026-27" — how a fiscal year is written on every Indian document. */
export function fiscalYearLabel(fiscalYear: number): string {
  return `${String(fiscalYear)}-${String((fiscalYear + 1) % 100).padStart(2, '0')}`;
}

export function fiscalYearBounds(fiscalYear: number, startMonth: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(fiscalYear, startMonth - 1, 1, 0, 0, 0)),
    to: new Date(Date.UTC(fiscalYear + 1, startMonth - 1, 0, 23, 59, 59, 999)),
  };
}

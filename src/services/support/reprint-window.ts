/**
 * The reprint window arithmetic, with no database and no clock of its own.
 *
 * Pulled out of the eligibility service so the rule the business actually promises its vendors —
 * "within N days of dispatch" — can be tested at its boundaries without a Postgres connection.
 * The service supplies the reference date, the window and the current time; this decides.
 */

export const DAY_MS = 86_400_000;

export interface ReprintWindow {
  days: number;
  requiresDispatch: boolean;
  daysSinceDispatch: number;
  daysRemaining: number;
  lastDateToRaise: string;
}

/** Whole days elapsed, floored — a request raised 23 hours after dispatch is on day zero. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Evaluates one order against the window.
 *
 * The boundary is deliberately inclusive: on a 15-day window, day 15 is still open and day 16 is
 * not. A vendor told "fifteen days" counts the fifteenth day as theirs, and a rule that expired a
 * day early would be read — correctly — as the business going back on its word.
 */
export function evaluateReprintWindow(input: {
  reference: Date;
  now: Date;
  windowDays: number;
  requiresDispatch: boolean;
}): ReprintWindow & { expired: boolean } {
  const daysSinceDispatch = daysBetween(input.reference, input.now);
  const lastDate = new Date(input.reference.getTime() + input.windowDays * DAY_MS);

  return {
    days: input.windowDays,
    requiresDispatch: input.requiresDispatch,
    daysSinceDispatch,
    daysRemaining: input.windowDays - daysSinceDispatch,
    lastDateToRaise: lastDate.toISOString(),
    expired: daysSinceDispatch > input.windowDays,
  };
}

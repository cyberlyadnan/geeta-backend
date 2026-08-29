import { FiscalPeriodStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { financeSettingsService } from './finance-settings.service.js';
import {
  coordinatesFor as calendarCoordinatesFor,
  fiscalYearBounds,
  fiscalYearLabel,
  MONTH_NAMES,
  type FiscalCoordinates,
} from './fiscal-calendar.js';

export type { FiscalCoordinates };

/**
 * Fiscal calendar and the period lock.
 *
 * The lock is the mechanism that makes handing books to a CA safe: once a return is filed for a
 * month, that month is LOCKED and nothing — not a back-dated expense, not a projection re-run —
 * can change what was filed. A correction to a locked period is posted into the open period as a
 * dated adjustment, which is exactly how it is done on paper.
 */
export class FiscalService {
  /** Which fiscal year/period a date falls in, given the configured fiscal year start month. */
  async coordinatesFor(date: Date): Promise<FiscalCoordinates> {
    const settings = await financeSettingsService.get();
    return this.coordinatesForWithStartMonth(date, settings.fiscalYearStartMonth);
  }

  coordinatesForWithStartMonth(date: Date, startMonth: number): FiscalCoordinates {
    return calendarCoordinatesFor(date, startMonth);
  }

  fiscalYearLabel(fiscalYear: number): string {
    return fiscalYearLabel(fiscalYear);
  }

  /**
   * Creates the FiscalYear and its twelve FiscalPeriod rows if they do not exist yet. Called
   * lazily from the posting path so a business that starts using the system mid-year never has to
   * "set up" a calendar first.
   */
  async ensureYear(fiscalYear: number, db: Prisma.TransactionClient | typeof prisma = prisma) {
    const settings = await financeSettingsService.get();
    const startMonth = settings.fiscalYearStartMonth;
    const label = this.fiscalYearLabel(fiscalYear);

    const existing = await db.fiscalYear.findUnique({
      where: { label },
      include: { periods: { orderBy: { periodNumber: 'asc' } } },
    });
    if (existing?.periods.length === 12) return existing;

    const startDate = new Date(Date.UTC(fiscalYear, startMonth - 1, 1));
    const endDate = new Date(Date.UTC(fiscalYear + 1, startMonth - 1, 0));

    const year =
      existing ??
      (await db.fiscalYear.create({ data: { label, startDate, endDate, status: FiscalPeriodStatus.OPEN } }));

    const have = new Set((existing?.periods ?? []).map((p) => p.periodNumber));
    for (let periodNumber = 1; periodNumber <= 12; periodNumber += 1) {
      if (have.has(periodNumber)) continue;
      const monthIndex = startMonth - 1 + (periodNumber - 1);
      const pStart = new Date(Date.UTC(fiscalYear, monthIndex, 1));
      const pEnd = new Date(Date.UTC(fiscalYear, monthIndex + 1, 0));
      await db.fiscalPeriod.create({
        data: {
          fiscalYearId: year.id,
          periodNumber,
          label: `${MONTH_NAMES[pStart.getUTCMonth()] ?? ''} ${String(pStart.getUTCFullYear())}`,
          startDate: pStart,
          endDate: pEnd,
          status: FiscalPeriodStatus.OPEN,
        },
      });
    }

    return db.fiscalYear.findUniqueOrThrow({
      where: { id: year.id },
      include: { periods: { orderBy: { periodNumber: 'asc' } } },
    });
  }

  /**
   * Refuses a posting into a closed or locked period. `allowClosedOverride` is what a SUPER_ADMIN
   * carries — it opens CLOSED but never LOCKED, because a LOCKED period backs a filed return.
   */
  async assertPostable(
    date: Date,
    options: { allowClosedOverride?: boolean } = {},
    db: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<FiscalCoordinates> {
    const coords = await this.coordinatesFor(date);
    const settings = await financeSettingsService.get();

    if (settings.booksBeginFrom && date < settings.booksBeginFrom) {
      throw ApiError.badRequest(
        `Books begin on ${settings.booksBeginFrom.toISOString().slice(0, 10)}. Nothing can be posted before that date.`,
      );
    }

    await this.ensureYear(coords.fiscalYear, db);
    const period = await db.fiscalPeriod.findFirst({
      where: {
        periodNumber: coords.fiscalPeriod,
        fiscalYear: { label: this.fiscalYearLabel(coords.fiscalYear) },
      },
      select: { status: true, label: true },
    });

    if (!period) return coords;
    if (period.status === FiscalPeriodStatus.LOCKED) {
      throw ApiError.badRequest(
        `${period.label} is locked — its GST return has been filed. Post the correction in the current open period instead.`,
      );
    }
    if (period.status === FiscalPeriodStatus.CLOSED && !options.allowClosedOverride) {
      throw ApiError.badRequest(
        `${period.label} is closed. A super admin can reopen it, or post the entry in the current period.`,
      );
    }
    return coords;
  }

  listYears() {
    return prisma.fiscalYear.findMany({
      orderBy: { startDate: 'desc' },
      include: { periods: { orderBy: { periodNumber: 'asc' } } },
    });
  }

  async setPeriodStatus(periodId: string, status: FiscalPeriodStatus, userId: string, notes?: string) {
    const period = await prisma.fiscalPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw ApiError.notFound('Fiscal period not found');
    if (period.status === FiscalPeriodStatus.LOCKED && status !== FiscalPeriodStatus.LOCKED) {
      throw ApiError.badRequest('A locked period cannot be reopened. Post an adjustment instead.');
    }
    return prisma.fiscalPeriod.update({
      where: { id: periodId },
      data: {
        status,
        notes: notes ?? period.notes,
        closedAt: status === FiscalPeriodStatus.OPEN ? null : new Date(),
        closedById: status === FiscalPeriodStatus.OPEN ? null : userId,
      },
    });
  }

  /** Inclusive date bounds of a fiscal year, for report range defaults. */
  async yearBounds(fiscalYear: number): Promise<{ from: Date; to: Date }> {
    const settings = await financeSettingsService.get();
    return fiscalYearBounds(fiscalYear, settings.fiscalYearStartMonth);
  }

  async currentFiscalYear(): Promise<number> {
    return (await this.coordinatesFor(new Date())).fiscalYear;
  }
}

export const fiscalService = new FiscalService();

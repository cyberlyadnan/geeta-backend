import { prisma } from '../../../config/database.js';
import { logger } from '../../../logs/logger.js';
import { financeSettingsService } from '../finance-settings.service.js';
import { bankTransactionsAdapter } from './bank-transactions.adapter.js';
import { counterReceiptsAdapter } from './counter-receipts.adapter.js';
import { creditNotesAdapter } from './credit-notes.adapter.js';
import { expensesAdapter } from './expenses.adapter.js';
import { financialEventsAdapter } from './financial-events.adapter.js';
import { invoicesAdapter } from './invoices.adapter.js';
import { purchaseBillsAdapter, supplierPaymentsAdapter } from './purchases.adapter.js';
import type { ProjectionAdapter, ProjectionOutcome } from './projection.types.js';

export * from './projection.types.js';

/**
 * Registration order matters exactly once: invoices must run after the events and receipts that
 * created the advances they settle, or the advance-application entry is short on its first pass.
 * A later pass corrects it anyway (the entry is keyed separately), but ordering makes the common
 * case right the first time.
 */
export const PROJECTION_ADAPTERS: ProjectionAdapter[] = [
  financialEventsAdapter,
  counterReceiptsAdapter,
  invoicesAdapter,
  expensesAdapter,
  purchaseBillsAdapter,
  supplierPaymentsAdapter,
  creditNotesAdapter,
  bankTransactionsAdapter,
];

export interface RunProjectionOptions {
  /** Only look at source rows created at or after this instant. Omit for a full backfill. */
  since?: Date;
  /** Restrict to named adapters — used by module write paths to sync just what they changed. */
  adapters?: string[];
  batchSize?: number;
  trigger?: string;
  createdById?: string;
  /** Skip the audit row — write paths syncing a single document do not need one each. */
  silent?: boolean;
}

export interface ProjectionRunSummary {
  runId: string | null;
  trigger: string;
  startedAt: Date;
  finishedAt: Date;
  posted: number;
  skipped: number;
  scanned: number;
  errorCount: number;
  outcomes: ProjectionOutcome[];
}

/**
 * Runs the projection.
 *
 * This one function is the whole synchronisation strategy: it is called inline after a finance
 * write (scoped to one adapter), on a schedule by the worker, from the admin "sync now" button,
 * and by the historical backfill script. Because every adapter is idempotent, those four callers
 * cannot conflict, and a missed inline call is simply picked up by the next scheduled pass —
 * which is what makes it safe for other modules to change without coordinating with accounting.
 */
export async function runAccountingProjection(
  options: RunProjectionOptions = {},
): Promise<ProjectionRunSummary> {
  const startedAt = new Date();
  const trigger = options.trigger ?? 'manual';
  const batchSize = options.batchSize ?? 500;

  const settings = await financeSettingsService.get();
  if (!settings.autoPostingEnabled && trigger !== 'backfill' && trigger !== 'admin') {
    logger.debug('Accounting projection skipped — auto posting is disabled in finance settings');
    return {
      runId: null,
      trigger,
      startedAt,
      finishedAt: new Date(),
      posted: 0,
      skipped: 0,
      scanned: 0,
      errorCount: 0,
      outcomes: [],
    };
  }

  const selected = options.adapters?.length
    ? PROJECTION_ADAPTERS.filter((a) => options.adapters!.includes(a.name))
    : PROJECTION_ADAPTERS;

  const run = options.silent
    ? null
    : await prisma.accountingProjectionRun.create({
        data: { trigger, createdById: options.createdById ?? null },
      });

  const outcomes: ProjectionOutcome[] = [];
  for (const adapter of selected) {
    try {
      outcomes.push(await adapter.run({ since: options.since, batchSize }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Accounting projection adapter failed', { adapter: adapter.name, message });
      outcomes.push({ adapter: adapter.name, scanned: 0, posted: 0, skipped: 0, errors: [{ sourceId: '-', message }] });
    }
  }

  const posted = outcomes.reduce((s, o) => s + o.posted, 0);
  const skipped = outcomes.reduce((s, o) => s + o.skipped, 0);
  const scanned = outcomes.reduce((s, o) => s + o.scanned, 0);
  const errors = outcomes.flatMap((o) => o.errors.map((e) => ({ adapter: o.adapter, ...e })));
  const finishedAt = new Date();

  if (run) {
    await prisma.accountingProjectionRun.update({
      where: { id: run.id },
      data: {
        finishedAt,
        entriesPosted: posted,
        errorCount: errors.length,
        errors: errors.slice(0, 50),
        sourcesScanned: Object.fromEntries(outcomes.map((o) => [o.adapter, o.scanned])),
      },
    });
  }

  if (posted > 0 || errors.length > 0) {
    logger.info('Accounting projection finished', { trigger, posted, skipped, scanned, errors: errors.length });
  }

  return {
    runId: run?.id ?? null,
    trigger,
    startedAt,
    finishedAt,
    posted,
    skipped,
    scanned,
    errorCount: errors.length,
    outcomes,
  };
}

/**
 * Fire-and-forget sync for a module that just wrote a finance document. Deliberately not awaited
 * by callers: the operational write has already succeeded and must not be made to fail — or wait —
 * because of bookkeeping. Anything missed here is caught by the scheduled pass.
 */
export function syncAccountingFor(adapterName: string, createdById?: string): void {
  void runAccountingProjection({
    adapters: [adapterName],
    // Small look-back so a document written moments ago is certainly inside the window.
    since: new Date(Date.now() - 10 * 60 * 1000),
    batchSize: 50,
    trigger: `inline:${adapterName}`,
    createdById,
    silent: true,
  }).catch((error: unknown) => {
    logger.error('Inline accounting sync failed; the scheduled pass will retry', {
      adapter: adapterName,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

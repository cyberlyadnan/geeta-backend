import { Queue, Worker } from 'bullmq';
import { bullmqConfig } from '../config/bullmq.js';
import { isRedisEnabled } from '../config/redis.js';
import { QUEUE_NAMES } from '../constants/queueNames.js';
import { logger } from '../logs/logger.js';
import { runAccountingProjection } from '../services/accounting/index.js';

/**
 * The safety net under the whole accounting design.
 *
 * Finance writes trigger the projection inline, but inline calls are best-effort by construction —
 * they are not awaited, so a restart, a transient database error, or a document created by a code
 * path nobody thought to hook can leave a gap. This job closes every one of those gaps: it re-runs
 * the same idempotent projection on a schedule, so the worst case for any missed document is that
 * it reaches the books a few minutes late rather than never.
 *
 * That guarantee is what lets other modules change freely. A new order flow, a new payment method,
 * a refactor of dispatch — none of them need to know accounting exists. Their rows land in the
 * source tables and this job picks them up.
 */
const REPEAT_EVERY_MS = 5 * 60 * 1000;
/** Look further back than the interval so a slow write is never missed at a window boundary. */
const LOOKBACK_MS = 60 * 60 * 1000;

let projectionQueue: Queue | null = null;

export function getAccountingProjectionQueue(): Queue | null {
  if (!isRedisEnabled()) return null;
  projectionQueue ??= new Queue(QUEUE_NAMES.ACCOUNTING_PROJECTION, {
    connection: bullmqConfig.connection,
    prefix: bullmqConfig.prefix,
  });
  return projectionQueue;
}

export async function scheduleAccountingProjectionJob(): Promise<void> {
  const queue = getAccountingProjectionQueue();
  if (!queue) {
    logger.warn(
      'Redis is disabled — the accounting projection will only run inline and on demand. ' +
        'Any document missed by an inline sync will stay unposted until someone presses "Sync ledger".',
    );
    return;
  }

  await queue.add(
    'project-accounting',
    {},
    {
      repeat: { every: REPEAT_EVERY_MS },
      jobId: 'accounting-projection-repeat',
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );

  logger.info('Accounting projection repeat job scheduled');
}

export function createAccountingProjectionWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.ACCOUNTING_PROJECTION,
    async () => {
      const summary = await runAccountingProjection({
        since: new Date(Date.now() - LOOKBACK_MS),
        batchSize: 1000,
        trigger: 'scheduled',
        // Only worth an audit row when it actually did something.
        silent: true,
      });

      if (summary.posted > 0 || summary.errorCount > 0) {
        logger.info('Scheduled accounting projection posted entries', {
          posted: summary.posted,
          skipped: summary.skipped,
          errors: summary.errorCount,
        });
      }
      return { posted: summary.posted, errors: summary.errorCount };
    },
    {
      connection: bullmqConfig.connection,
      prefix: bullmqConfig.prefix,
      // One at a time: concurrent passes would race on the same source rows and just collide on
      // the idempotency constraint, wasting connections to prove what the constraint already knows.
      concurrency: 1,
    },
  );
}

import type { JournalSourceType } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { logger } from '../../../logs/logger.js';
import { postingService } from '../posting.service.js';
import type { EntryPlan, ProjectionOutcome } from './projection.types.js';

/**
 * Which of these source keys already have a journal entry.
 *
 * The projection is idempotent at the database level anyway (the unique constraint), but checking
 * first turns "re-run over 200k historical rows" from 200k failed inserts into two queries — the
 * difference between a backfill that finishes and one that doesn't.
 */
export async function findPostedKeys(
  sourceType: JournalSourceType,
  keys: string[],
): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await prisma.journalEntry.findMany({
    where: { sourceType, sourceKey: { in: keys } },
    select: { sourceKey: true },
  });
  return new Set(rows.map((r) => r.sourceKey));
}

/**
 * Posts a batch of planned entries, isolating failures: one malformed document must not stop the
 * projection for every document behind it. Failures are reported, and because nothing is marked as
 * processed anywhere, the next pass retries them automatically.
 */
export async function postPlans(
  outcome: ProjectionOutcome,
  plans: { sourceId: string; plans: EntryPlan[] }[],
): Promise<ProjectionOutcome> {
  for (const { sourceId, plans: entries } of plans) {
    try {
      for (const plan of entries) {
        const result = await postingService.post(plan);
        if (result.deduplicated) outcome.skipped += 1;
        else outcome.posted += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome.errors.push({ sourceId, message });
      logger.warn('Accounting projection could not post a document', {
        adapter: outcome.adapter,
        sourceId,
        message,
      });
    }
  }
  return outcome;
}

export function toNumber(value: { toNumber(): number } | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

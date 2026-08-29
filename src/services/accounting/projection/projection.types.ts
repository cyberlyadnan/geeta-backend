import type { JournalSourceType } from '@prisma/client';
import type { PostEntryInput } from '../posting.service.js';

export interface ProjectionWindow {
  /** Only consider source rows created at or after this instant. Omit for a full backfill. */
  since?: Date;
  /** Safety valve so one pass cannot run unbounded on first backfill. */
  batchSize: number;
}

export interface ProjectionOutcome {
  adapter: string;
  scanned: number;
  posted: number;
  skipped: number;
  errors: { sourceId: string; message: string }[];
}

/**
 * An adapter turns one kind of source document into journal entries.
 *
 * Adapters are the extension point of the whole accounting design: a new money flow added to the
 * platform later needs a new adapter and nothing else. It must not mutate its source document, and
 * `build` must be a pure function of the document — same document in, same entries out — because
 * the orchestrator may call it again at any time.
 */
export interface ProjectionAdapter {
  name: string;
  sourceTypes: JournalSourceType[];
  run(window: ProjectionWindow): Promise<ProjectionOutcome>;
}

export function emptyOutcome(adapter: string): ProjectionOutcome {
  return { adapter, scanned: 0, posted: 0, skipped: 0, errors: [] };
}

export type EntryPlan = PostEntryInput;

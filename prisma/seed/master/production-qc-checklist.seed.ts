import type { SeedContext } from '../core/types.js';
import { seedQcTemplates } from './qc.seed.js';

/** @deprecated Use seedQcTemplates */
export async function seedProductionQcChecklist(ctx: SeedContext): Promise<void> {
  await seedQcTemplates(ctx);
}

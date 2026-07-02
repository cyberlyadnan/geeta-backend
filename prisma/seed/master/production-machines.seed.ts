import type { SeedContext } from '../core/types.js';
import { seedMachines } from './machines.seed.js';

/** @deprecated Use seedMachines */
export async function seedProductionMachines(ctx: SeedContext): Promise<void> {
  await seedMachines(ctx);
}

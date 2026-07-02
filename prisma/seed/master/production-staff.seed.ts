import type { SeedContext } from '../core/types.js';
import { seedUsers } from './users.seed.js';

/** @deprecated Use seedUsers */
export async function seedProductionStaff(ctx: SeedContext): Promise<void> {
  await seedUsers(ctx);
}

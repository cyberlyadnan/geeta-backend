/**
 * @deprecated Import from prisma/seed/index.ts — kept for backward compatibility.
 */
import { PrismaClient } from '@prisma/client';
import { runProductionSeed } from './seed/index.js';

export async function seedPrintMasters(client?: PrismaClient): Promise<void> {
  if (client) {
    await runProductionSeed({ scope: 'master', prisma: client });
    await runProductionSeed({ scope: 'products', prisma: client });
    return;
  }
  await runProductionSeed({ scope: 'all' });
}

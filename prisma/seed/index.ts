import { PrismaClient } from '@prisma/client';
import { createEmptyRegistry } from './core/types.js';
import { createSeedLogger } from './core/logger.js';
import { seedRolesAndAdmin } from './core/roles.seed.js';
import { seedMasterData } from './master/index.js';
import { seedProducts } from './catalog/products.seed.js';
import { hydrateRegistryFromDatabase } from './core/registry-loader.js';

export type SeedScope = 'all' | 'roles' | 'master' | 'products' | 'pricing';

export interface RunSeedOptions {
  scope?: SeedScope;
  prisma?: PrismaClient;
}

export async function runProductionSeed(options: RunSeedOptions = {}): Promise<void> {
  const scope = options.scope ?? 'all';
  const prisma = options.prisma ?? new PrismaClient();
  const ownsClient = !options.prisma;
  const log = createSeedLogger('orchestrator');

  const registry = createEmptyRegistry();
  let actorId: string | undefined;

  try {
    if (scope === 'all' || scope === 'roles') {
      log.info('Phase: roles & admin');
      actorId = await seedRolesAndAdmin(prisma);
    } else {
      const admin = await prisma.user.findFirst({ where: { email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@geetaprint.com' } });
      actorId = admin?.id;
    }

    const ctx = { prisma, registry, log, actorId };

    if (scope === 'all' || scope === 'master' || scope === 'pricing') {
      log.info('Phase: master data');
      await seedMasterData(ctx);
    }

    if (scope === 'all' || scope === 'products') {
      log.info('Phase: product catalog');
      if (scope === 'products') {
        await hydrateRegistryFromDatabase(ctx);
      }
      await seedProducts(ctx);
    }

    log.info(`Seed finished (scope=${scope})`);
  } finally {
    if (ownsClient) await prisma.$disconnect();
  }
}

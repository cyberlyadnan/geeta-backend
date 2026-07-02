import { PrismaClient } from '@prisma/client';
import { createEmptyRegistry } from './core/types.js';
import { createSeedLogger } from './core/logger.js';
import { seedRolesAndAdmin } from './core/roles.seed.js';
import { seedMasterData } from './master/index.js';
import { seedProducts } from './catalog/products.seed.js';
import { hydrateRegistryFromDatabase } from './core/registry-loader.js';
import { seedProductWorkflows } from './master/product-workflows.seed.js';
import { seedOrders } from './master/orders.seed.js';

export type SeedScope = 'all' | 'roles' | 'master' | 'products' | 'pricing' | 'orders';

export interface RunSeedOptions {
  scope?: SeedScope;
  prisma?: PrismaClient;
}

async function hydrateProductionRegistry(ctx: {
  prisma: PrismaClient;
  registry: ReturnType<typeof createEmptyRegistry>;
}): Promise<void> {
  const facility = await ctx.prisma.facility.findFirst({ where: { code: 'GEETA-MAIN' } });
  if (facility) ctx.registry.facilityId = facility.id;

  const departments = await ctx.prisma.department.findMany({ select: { id: true, code: true } });
  for (const dept of departments) ctx.registry.departments.set(dept.code, dept.id);

  const templates = await ctx.prisma.workflowTemplate.findMany({ select: { id: true, code: true } });
  for (const tpl of templates) ctx.registry.workflowTemplates.set(tpl.code, tpl.id);
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
      log.info('Phase: roles, permissions & super admin');
      actorId = await seedRolesAndAdmin(prisma);
    } else {
      const admin = await prisma.user.findFirst({
        where: { email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@geetaprint.com' },
      });
      actorId = admin?.id;
    }

    const ctx = { prisma, registry, log, actorId };

    if (scope === 'all' || scope === 'master' || scope === 'pricing') {
      log.info('Phase: master data (catalog config + production ERP)');
      await seedMasterData(ctx);
    }

    if (scope === 'all' || scope === 'products' || scope === 'orders') {
      log.info('Phase: product catalog');
      if (scope === 'products' || scope === 'orders') {
        await hydrateRegistryFromDatabase(ctx);
        await hydrateProductionRegistry(ctx);
      }
      await seedProducts(ctx);

      log.info('Phase: product → workflow links');
      if (scope === 'products' || scope === 'orders') {
        await hydrateProductionRegistry(ctx);
      }
      await seedProductWorkflows(ctx);
    }

    if (scope === 'all' || scope === 'orders') {
      log.info('Phase: test production orders');
      await seedOrders(ctx);
    }

    log.info(`Seed finished (scope=${scope})`);
  } finally {
    if (ownsClient) await prisma.$disconnect();
  }
}

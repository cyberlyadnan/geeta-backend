import { spawn } from 'node:child_process';
import path from 'node:path';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { isDevelopmentEnvironment } from './system-admin.access.js';

export type SeedScope = 'all' | 'roles' | 'master' | 'products' | 'pricing' | 'orders';

const SEED_ORDER_NUMBERS = [
  'GP-SEED-000001',
  'GP-SEED-000002',
  'GP-SEED-000003',
  'GP-SEED-000004',
  'GP-SEED-000005',
  'GP-SEED-000006',
  'GP-SEED-000007',
  'GP-SEED-000008',
  'GP-SEED-000009',
  'GP-SEED-000010',
];

function runSeedCli(scope: SeedScope): Promise<void> {
  const scriptPath = path.join(process.cwd(), 'prisma', 'seed', 'run.ts');
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', scriptPath, `--only=${scope}`], {
      cwd: process.cwd(),
      shell: true,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Seed process exited with code ${code ?? 'unknown'}`));
    });
  });
}

export class SystemSeedService {
  assertDevOnly() {
    if (!isDevelopmentEnvironment()) {
      throw ApiError.forbidden('Seed manager is only available in development environment');
    }
  }

  async run(scope: SeedScope) {
    this.assertDevOnly();
    await runSeedCli(scope);
    return { success: true, scope };
  }

  async clearDemoData() {
    this.assertDevOnly();

    const orders = await prisma.productionOrder.findMany({
      where: { orderNumber: { in: SEED_ORDER_NUMBERS } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);

    if (orderIds.length > 0) {
      await prisma.productionOrder.deleteMany({ where: { id: { in: orderIds } } });
    }

    return { deletedOrders: orderIds.length };
  }

  async resetDevelopmentHint() {
    this.assertDevOnly();
    return {
      message:
        'Full database reset requires `npx prisma migrate reset` locally. Use seed scopes to refresh master data safely.',
      scopes: ['all', 'roles', 'master', 'products', 'pricing', 'orders'] as SeedScope[],
    };
  }
}

export const systemSeedService = new SystemSeedService();

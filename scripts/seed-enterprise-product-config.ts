/**
 * Seed enterprise product configuration onto EXISTING first-client products.
 *
 * Does NOT create categories / families / series / products.
 *
 * Run from backend:
 *   npm run seed:enterprise-config
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createEmptyRegistry } from '../prisma/seed/core/types.js';
import { createSeedLogger } from '../prisma/seed/core/logger.js';
import {
  formatEnterpriseConfigReportMarkdown,
  seedEnterpriseProductConfiguration,
} from '../prisma/seed/catalog/enterprise-config.seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const REPORT_PATH = join(REPO_ROOT, 'docs', 'ENTERPRISE_CONFIG_SEED_REPORT.md');

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const log = createSeedLogger('seed-enterprise-config');

  try {
    const admin = await prisma.user.findFirst({
      where: { email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@geetaprint.com' },
    });

    const ctx = {
      prisma,
      registry: createEmptyRegistry(),
      log,
      actorId: admin?.id,
    };

    log.info('Seeding enterprise configuration on existing Digital Printing products…');
    const report = await seedEnterpriseProductConfiguration(ctx);

    const markdown = formatEnterpriseConfigReportMarkdown(report);
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, markdown, 'utf8');

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  Enterprise Product Configuration Seed');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Updated: ${report.productsUpdated.length}`);
    console.log(`Skipped: ${report.productsSkipped.length}`);
    console.log(`Fields:  ${report.fieldsUpserted}`);
    console.log(`Options: ${report.optionsUpserted}`);
    console.log(`Rules:   ${report.rulesSynced}`);
    console.log(`Verify:  ${report.verification.passed ? 'PASSED' : 'FAILED'}`);
    for (const c of report.verification.cases) {
      console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}`);
      if (!c.ok) console.log(`      ${c.detail}`);
    }
    console.log(`Report:  ${REPORT_PATH}`);
    console.log('═══════════════════════════════════════════════════\n');

    if (!report.verification.passed || report.productsUpdated.length === 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

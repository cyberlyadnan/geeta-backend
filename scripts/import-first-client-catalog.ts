/**
 * First client catalog migration — idempotent import with audit.
 *
 * Run from backend:
 *   npm run seed:client-catalog
 *
 * Or:
 *   npx dotenv -e .env -e .env.local -- tsx scripts/import-first-client-catalog.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createEmptyRegistry } from '../prisma/seed/core/types.js';
import { createSeedLogger } from '../prisma/seed/core/logger.js';
import {
  formatImportReportMarkdown,
  importFirstClientCatalog,
} from '../prisma/seed/catalog/first-client-catalog.seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const REPORT_PATH = join(REPO_ROOT, 'docs', 'FIRST_CLIENT_CATALOG_IMPORT.md');

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const log = createSeedLogger('import-first-client-catalog');

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

    log.info('Starting first client catalog import (Digital Printing / Art Paper / Gumming)...');
    const report = await importFirstClientCatalog(ctx);

    const markdown = formatImportReportMarkdown(report);
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, markdown, 'utf8');

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  First Client Catalog Import');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Report: ${REPORT_PATH}`);
    console.log(`Products: ${report.created.products.length} created, ${report.updated.products.length} updated`);
    console.log(`Validation: ${report.validation.passed ? 'PASSED' : 'FAILED'}`);
    if (report.validation.issues.length) {
      console.log('\nIssues:');
      report.validation.issues.forEach((i) => console.log(`  • ${i}`));
    }
    console.log('═══════════════════════════════════════════════════\n');

    if (!report.validation.passed) {
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

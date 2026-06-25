import '../../src/config/load-env.js';
import { performance } from 'node:perf_hooks';
import { prisma, disconnectDatabase } from '../../src/config/database.js';

const SLOW_MS = Number(process.env['OBSERVABILITY_SLOW_QUERY_MS'] ?? 100);

async function explain(label: string, sql: string): Promise<void> {
  const start = performance.now();
  const rows = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`,
  );
  const ms = Math.round((performance.now() - start) * 100) / 100;
  console.log(`\n=== ${label} (${ms}ms to explain) ===`);
  for (const row of rows) {
    console.log(row['QUERY PLAN']);
  }
}

async function main(): Promise<void> {
  console.log('=== EXPLAIN ANALYZE — Common Query Patterns ===\n');

  await explain(
    'User login by email',
    `SELECT u.id FROM users u WHERE u.email = 'admin@geeta.com' AND u.deleted_at IS NULL LIMIT 1`,
  );

  await explain(
    'Activity logs — admin feed (vendor_profile_id NOT NULL)',
    `SELECT id FROM activity_logs WHERE vendor_profile_id IS NOT NULL ORDER BY created_at DESC LIMIT 25`,
  );

  await explain(
    'Vendor list by status + sort',
    `SELECT id FROM vendor_profiles WHERE account_status = 'VERIFIED' ORDER BY created_at DESC LIMIT 20`,
  );

  await explain(
    'Refresh tokens — active lookup',
    `SELECT id FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
  );

  await explain(
    'Production orders by customer',
    `SELECT id FROM production_orders WHERE customer_id IS NOT NULL ORDER BY created_at DESC LIMIT 20`,
  );

  console.log(`\nSlow query log threshold: ${SLOW_MS}ms`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => disconnectDatabase());

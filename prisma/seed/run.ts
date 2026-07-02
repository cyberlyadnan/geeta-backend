#!/usr/bin/env tsx
/**
 * Production seed CLI
 *
 * Usage:
 *   npm run seed              # full seed (roles + masters + products)
 *   npm run seed:master       # print masters + categories + settings only
 *   npm run seed:products     # product catalog only (requires masters)
 *   npm run seed:orders       # product links + test orders only (requires masters + products)
 */
import { runProductionSeed, type SeedScope } from './index.js';

function parseScope(): SeedScope {
  const arg = process.argv.find((a) => a.startsWith('--only='));
  if (!arg) return 'all';
  const value = arg.split('=')[1] as SeedScope;
  if (!['all', 'roles', 'master', 'products', 'pricing', 'orders'].includes(value)) {
    console.error(`Unknown scope: ${value}`);
    process.exit(1);
  }
  return value;
}

runProductionSeed({ scope: parseScope() }).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

/**
 * Phase 0–4 stabilization harness.
 *
 * Runs against the configured database. EVERYTHING it creates is namespaced `QA-STAB-` (or
 * qa-stab- for emails) so teardown can find it deterministically. It never touches pre-existing
 * data — in particular it creates its own vendor and wallet rather than using a real one.
 *
 *   npm run qa:stab -- concurrency-wallet
 *   npm run qa:stab -- concurrency-udhar
 *   npm run qa:stab -- integrity
 *   npm run qa:stab -- teardown
 *   npm run qa:stab -- all
 */
import { PrismaClient, Prisma, RoleName, WalletTransactionType } from '@prisma/client';
import { walletLedgerService } from '../../src/services/ledger/wallet-ledger.service.js';
import { creditLedgerService } from '../../src/services/ledger/credit-ledger.service.js';

const prisma = new PrismaClient();
const TAG = 'QA-STAB';

let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`  [${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── fixtures ────────────────────────────────────────────────────────────────

async function createQaVendor(label: string, openingBalance: number) {
  const role = await prisma.role.findFirstOrThrow({ where: { name: RoleName.VENDOR } });
  const user = await prisma.user.create({
    data: {
      email: `qa-stab-${label}-${Date.now()}@example.invalid`,
      passwordHash: 'qa-stabilization-not-a-real-hash',
      firstName: TAG,
      lastName: label,
      roleId: role.id,
    },
    select: { id: true },
  });
  await prisma.wallet.create({
    data: { userId: user.id, currentBalance: new Prisma.Decimal(openingBalance) },
  });
  return user.id;
}

// ── Step 3: concurrent wallet debits ────────────────────────────────────────

async function concurrencyWallet() {
  console.log('\n▶ Concurrent wallet debits against one vendor');
  const OPENING = 1000;
  const DEBIT = 100;
  const PARALLEL = 20; // 20 × 100 = 2000 > 1000, so ~half must be refused

  const userId = await createQaVendor('wallet', OPENING);

  const results = await Promise.allSettled(
    Array.from({ length: PARALLEL }, (_, i) =>
      walletLedgerService.debitWallet({
        userId,
        amount: DEBIT,
        type: WalletTransactionType.DEBIT,
        remarks: `${TAG} concurrent debit ${i}`,
        financialEvent: { eventType: 'ORDER_PLACEMENT_DEBIT', referenceType: 'ORDER', referenceId: `${TAG}-${i}` },
      }),
    ),
  );

  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const reasons = results.filter((r) => r.status === 'rejected')
    .map((r) => String((r as PromiseRejectedResult).reason?.message ?? ''));
  const insufficient = reasons.filter((m) => /Insufficient wallet balance/.test(m)).length;
  const timeouts = reasons.filter((m) => /Transaction (already closed|not found)|expired transaction/.test(m)).length;
  const other = reasons.length - insufficient - timeouts;
  const distinct = [...new Set(reasons.map((m) => m.split(/\r?\n/)[0]!.slice(0, 120)))];
  distinct.forEach((m) => console.log(`    refusal: ${m}`));
  const rejected = results.length - ok;

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  const balance = wallet.currentBalance.toNumber();
  const txCount = await prisma.walletTransaction.count({ where: { userId } });
  const eventCount = await prisma.financialEvent.count({ where: { actorId: userId } });

  console.log(`  ${ok} succeeded, ${rejected} refused (insufficient=${insufficient}, timeout=${timeouts}, other=${other}); balance ${balance}`);
  check('refusals are business refusals, not infrastructure timeouts', timeouts === 0, `${timeouts} tx timeouts`);
  check('every fundable debit succeeded', ok === OPENING / DEBIT, `ok=${ok} expected=${OPENING / DEBIT}`);
  check('balance never goes negative', balance >= 0, `balance=${balance}`);
  check(
    'balance exactly equals opening minus successful debits',
    balance === OPENING - ok * DEBIT,
    `${balance} === ${OPENING} - ${ok}×${DEBIT}`,
  );
  check('no more debits succeeded than the balance could fund', ok <= OPENING / DEBIT, `ok=${ok}`);
  check('one WalletTransaction per successful debit', txCount === ok, `tx=${txCount} ok=${ok}`);
  check('one FinancialEvent per successful debit', eventCount === ok, `events=${eventCount} ok=${ok}`);
  return userId;
}

// ── Step 3: concurrent Udhar draws ──────────────────────────────────────────

async function concurrencyUdhar() {
  console.log('\n▶ Concurrent Udhar draws against one credit limit');
  const LIMIT = 1000;
  const DRAW = 100;
  const PARALLEL = 20;

  const userId = await createQaVendor('udhar', 0);
  await creditLedgerService.setCreditLimit({ actorType: 'VENDOR', actorId: userId, creditLimit: LIMIT });

  const results = await Promise.allSettled(
    Array.from({ length: PARALLEL }, (_, i) =>
      creditLedgerService.drawOnCredit({
        actorType: 'VENDOR',
        actorId: userId,
        amount: DRAW,
        recordedByUserId: userId,
        note: `${TAG} concurrent draw ${i}`,
      }),
    ),
  );

  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const account = await prisma.creditAccount.findFirstOrThrow({
    where: { actorType: 'VENDOR', actorId: userId },
  });
  const outstanding = account.outstandingBalance.toNumber();
  const txCount = await prisma.creditTransaction.count({ where: { creditAccountId: account.id } });
  const drawEvents = await prisma.financialEvent.count({
    where: { actorId: userId, eventType: 'UDHAR_DRAW' },
  });

  console.log(`  ${ok} succeeded, ${results.length - ok} refused; outstanding ${outstanding}`);
  check('outstanding never exceeds the credit limit', outstanding <= LIMIT, `${outstanding} <= ${LIMIT}`);
  check('outstanding equals successful draws', outstanding === ok * DRAW, `${outstanding} === ${ok}×${DRAW}`);
  check('no more draws succeeded than the limit allows', ok <= LIMIT / DRAW, `ok=${ok}`);
  check('one CreditTransaction per successful draw', txCount === ok, `tx=${txCount}`);
  check('one UDHAR_DRAW FinancialEvent per successful draw', drawEvents === ok, `events=${drawEvents}`);

  // over-repayment floors at 0 but records the full amount
  await creditLedgerService.recordRepayment({
    actorType: 'VENDOR', actorId: userId, amount: outstanding + 500, recordedByUserId: userId,
  });
  const after = await prisma.creditAccount.findFirstOrThrow({ where: { id: account.id } });
  const repayTx = await prisma.creditTransaction.findFirstOrThrow({
    where: { creditAccountId: account.id, type: 'REPAYMENT' }, orderBy: { createdAt: 'desc' },
  });
  check('over-repayment floors outstanding at 0', after.outstandingBalance.toNumber() === 0);
  check(
    'over-repayment still records the full amount tendered',
    repayTx.amount.toNumber() === outstanding + 500,
    `recorded=${repayTx.amount.toNumber()}`,
  );
  return userId;
}

// ── Step 4: data integrity sweep ────────────────────────────────────────────

async function integrity() {
  console.log('\n▶ Data integrity sweep (read-only, whole database)');

  const negWallets = await prisma.wallet.count({ where: { currentBalance: { lt: 0 } } });
  check('no wallet has a negative balance', negWallets === 0, `${negWallets} found`);

  const negCredit = await prisma.creditAccount.count({ where: { outstandingBalance: { lt: 0 } } });
  check('no credit account has a negative outstanding balance', negCredit === 0, `${negCredit} found`);

  const overLimit = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM credit_accounts WHERE outstanding_balance > credit_limit`;
  check('no credit account exceeds its limit', overLimit.length === 0, `${overLimit.length} found`);

  const orphanOrders = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM production_orders
    WHERE (customer_id IS NULL AND retail_customer_id IS NULL)
       OR (customer_id IS NOT NULL AND retail_customer_id IS NOT NULL)`;
  check('every order has exactly one actor (vendor XOR retail)', orphanOrders.length === 0, `${orphanOrders.length} violations`);

  const itemsNoSnapshot = await prisma.productionOrderItem.count({ where: { priceSnapshotId: null } });
  check('every order item pins a price snapshot', itemsNoSnapshot === 0, `${itemsNoSnapshot} without`);

  // Orphaned snapshots: not referenced by any order item and not either side of an amendment.
  const orphanSnaps = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM price_snapshots ps
    WHERE NOT EXISTS (SELECT 1 FROM production_order_items i WHERE i.price_snapshot_id = ps.id)
      AND NOT EXISTS (SELECT 1 FROM order_amendments a
                      WHERE a.previous_snapshot_id = ps.id OR a.new_snapshot_id = ps.id)`;
  const orphanCount = Number(orphanSnaps[0]?.n ?? 0);
  console.log(`  orphaned price snapshots: ${orphanCount}`);

  const amendNoLink = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM order_amendments a
    WHERE NOT EXISTS (SELECT 1 FROM price_snapshots p WHERE p.id = a.previous_snapshot_id)
       OR NOT EXISTS (SELECT 1 FROM price_snapshots p WHERE p.id = a.new_snapshot_id)`;
  check('every amendment links two real snapshots', Number(amendNoLink[0]?.n ?? 0) === 0);

  // FinancialEvent coverage: every wallet transaction created after Phase 2 shipped must have one.
  const PHASE2 = new Date('2026-08-04T00:00:00Z');
  const txSince = await prisma.walletTransaction.count({ where: { createdAt: { gte: PHASE2 } } });
  const evSince = await prisma.financialEvent.count({
    where: { createdAt: { gte: PHASE2 }, instrument: 'WALLET' },
  });
  check(
    'every post-Phase-2 wallet transaction has a matching FinancialEvent',
    evSince >= txSince,
    `walletTx=${txSince} walletEvents=${evSince}`,
  );

  const dupInvoice = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT invoice_number FROM invoices GROUP BY invoice_number HAVING COUNT(*) > 1) d`;
  check('invoice numbers are unique', Number(dupInvoice[0]?.n ?? 0) === 0);

  const dupBatchOrder = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT order_id FROM dispatch_batch_orders GROUP BY order_id HAVING COUNT(*) > 1) d`;
  check('an order belongs to at most one dispatch batch', Number(dupBatchOrder[0]?.n ?? 0) === 0);

  return orphanCount;
}


// ── Regression guard for BUG-00: every Prisma field must map to a real column ────────────────

async function columnMapping() {
  console.log('\n▶ Prisma model fields vs actual database columns');
  const { Prisma: P } = await import('@prisma/client');
  const dmmf = (P as unknown as { dmmf: { datamodel: { models: Array<{ name: string; dbName: string | null;
    fields: Array<{ name: string; dbName: string | null; kind: string; relationName?: string }> }> } } }).dmmf;

  const mismatches: string[] = [];
  for (const model of dmmf.datamodel.models) {
    const table = model.dbName ?? model.name;
    const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      'SELECT column_name FROM information_schema.columns WHERE table_name = $1', table);
    if (rows.length === 0) continue; // table not in this database
    const actual = new Set(rows.map((r) => r.column_name));
    for (const field of model.fields) {
      if (field.kind === 'object') continue;          // relations have no column
      const expected = field.dbName ?? field.name;
      if (!actual.has(expected)) mismatches.push(`${table}.${expected} (${model.name}.${field.name})`);
    }
  }
  mismatches.forEach((m) => console.log(`    MISSING: ${m}`));
  check('every Prisma scalar field maps to an existing column', mismatches.length === 0,
    `${mismatches.length} mismatch(es)`);
}

// ── teardown ────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n▶ Teardown — removing all QA-STAB fixtures');
  const users = await prisma.user.findMany({
    where: { firstName: TAG }, select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) {
    console.log('  nothing to remove');
    return;
  }
  const accounts = await prisma.creditAccount.findMany({
    where: { actorId: { in: ids } }, select: { id: true },
  });
  await prisma.creditTransaction.deleteMany({ where: { creditAccountId: { in: accounts.map((a) => a.id) } } });
  await prisma.creditAccount.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.financialEvent.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.walletBalanceSnapshot.deleteMany({ where: { wallet: { userId: { in: ids } } } });
  await prisma.financialAuditLog.deleteMany({ where: { targetUserId: { in: ids } } });
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: ids } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`  removed ${ids.length} QA vendor(s) and all dependent rows`);
}

// ── entry ───────────────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2] ?? 'all';
  console.log(`Stabilization harness — mode: ${mode}`);
  try {
    if (mode === 'concurrency-wallet' || mode === 'all') await concurrencyWallet();
    if (mode === 'concurrency-udhar' || mode === 'all') await concurrencyUdhar();
    if (mode === 'integrity' || mode === 'all') await integrity();
    if (mode === 'integrity' || mode === 'columns' || mode === 'all') await columnMapping();
    if (mode === 'teardown') await teardown();
    if (mode === 'all') await teardown();
  } finally {
    await prisma.$disconnect();
  }
  console.log(failures === 0 ? '\n✔ all checks passed' : `\n✘ ${failures} check(s) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();

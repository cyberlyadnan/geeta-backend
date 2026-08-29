/**
 * Read-only health check on the books. Writes nothing; safe to run against production.
 *
 *   npm run accounting:verify
 *
 * Prints the same checks the admin reconciliation screen shows, plus the statements themselves, so
 * the numbers can be eyeballed before anything is sent to a CA. Exits non-zero when a hard check
 * fails, which makes it usable as a pre-deploy or nightly guard.
 */
import '../src/config/load-env.js';
import { prisma } from '../src/config/database.js';
import {
  balanceSheetService,
  fiscalService,
  profitLossService,
  reconciliationService,
  trialBalanceService,
} from '../src/services/accounting/index.js';

const inr = (value: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

async function main(): Promise<void> {
  const fiscalYear = await fiscalService.currentFiscalYear();
  const { from, to } = await fiscalService.yearBounds(fiscalYear);
  const label = fiscalService.fiscalYearLabel(fiscalYear);

  process.stdout.write(`\nBooks check — FY ${label}\n${'='.repeat(60)}\n\n`);

  const [trialBalance, pnl, balanceSheet, reconciliation] = await Promise.all([
    trialBalanceService.build({ from, to }),
    profitLossService.build({ from, to }),
    balanceSheetService.build({ asAt: to }),
    reconciliationService.build({ from, to }),
  ]);

  process.stdout.write('TRIAL BALANCE\n');
  process.stdout.write(`  Debits  ${inr(trialBalance.totals.debit)}\n`);
  process.stdout.write(`  Credits ${inr(trialBalance.totals.credit)}\n`);
  process.stdout.write(`  ${trialBalance.isBalanced ? '✓ balanced' : `✗ out by ${inr(trialBalance.totals.difference)}`}\n\n`);

  process.stdout.write('PROFIT & LOSS\n');
  process.stdout.write(`  Revenue        ${inr(pnl.summary.netRevenue)}\n`);
  process.stdout.write(`  Cost of sales  ${inr(pnl.summary.costOfSales)}\n`);
  process.stdout.write(`  Gross profit   ${inr(pnl.summary.grossProfit)}  (${pnl.summary.grossMarginPercent.toFixed(1)}%)\n`);
  process.stdout.write(`  Expenses       ${inr(pnl.summary.operatingExpenses)}\n`);
  process.stdout.write(`  Net profit     ${inr(pnl.summary.netProfit)}  (${pnl.summary.netMarginPercent.toFixed(1)}%)\n\n`);

  process.stdout.write('BALANCE SHEET\n');
  process.stdout.write(`  Total assets              ${inr(balanceSheet.totals.assets)}\n`);
  process.stdout.write(`  Total liabilities + equity ${inr(balanceSheet.totals.liabilitiesAndEquity)}\n`);
  process.stdout.write(`  ${balanceSheet.isBalanced ? '✓ balanced' : `✗ out by ${inr(balanceSheet.totals.difference)}`}\n\n`);

  process.stdout.write('RECONCILIATION AGAINST SOURCE DOCUMENTS\n');
  for (const check of reconciliation.checks) {
    const mark = check.status === 'OK' ? '✓' : check.status === 'WARNING' ? '!' : '✗';
    process.stdout.write(`  ${mark} ${check.label}\n`);
    if (check.status !== 'OK') {
      process.stdout.write(`      expected ${inr(check.expected)} · found ${inr(check.actual)} · ${check.detail}\n`);
    }
  }

  if (reconciliation.unpostedDocuments.length > 0) {
    process.stdout.write('\n  Waiting to be posted:\n');
    for (const row of reconciliation.unpostedDocuments) {
      process.stdout.write(`    ${row.source}: ${row.count}\n`);
    }
    process.stdout.write('    Run "npm run accounting:backfill" or press "Sync ledger" in the admin.\n');
  }

  process.stdout.write('\n');

  const hardFailure = !trialBalance.isBalanced || !balanceSheet.isBalanced ||
    reconciliation.checks.some((c) => c.status === 'ERROR');
  if (hardFailure) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

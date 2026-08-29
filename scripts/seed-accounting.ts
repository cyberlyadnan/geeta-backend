/**
 * Installs the accounting foundation on an existing database, then brings the books up to date
 * with everything that has already happened in the business.
 *
 * Run once after the migration:
 *   npm run accounting:setup
 *
 * It is safe to run again — every step is idempotent. The backfill in particular can be re-run as
 * often as needed: journal entries are keyed by their source document, so a second pass posts only
 * what the first one missed.
 */
import '../src/config/load-env.js';
import { prisma } from '../src/config/database.js';
import { logger } from '../src/logs/logger.js';
import {
  ACCOUNT_CODES,
  accountResolver,
  ensureChartOfAccounts,
  financeSettingsService,
  fiscalService,
  invoiceTaxService,
  runAccountingProjection,
  trialBalanceService,
} from '../src/services/accounting/index.js';
import { DEFAULT_EXPENSE_CATEGORIES } from '../src/services/accounting/expense-categories.seed.js';

async function seedExpenseCategories(): Promise<number> {
  const existing = new Set(
    (await prisma.expenseCategory.findMany({ select: { code: true } })).map((c) => c.code),
  );
  let created = 0;

  for (const seed of DEFAULT_EXPENSE_CATEGORIES) {
    if (existing.has(seed.code)) continue;
    const account = await prisma.chartOfAccount.findUnique({ where: { code: seed.ledgerAccountCode } });
    if (!account) {
      logger.warn(`Skipping expense category ${seed.code} — no ledger account ${seed.ledgerAccountCode}`);
      continue;
    }
    await prisma.expenseCategory.create({
      data: {
        code: seed.code,
        name: seed.name,
        ledgerAccountId: account.id,
        inputCreditEligible: seed.inputCreditEligible,
        sortOrder: seed.sortOrder,
        isSystem: true,
      },
    });
    created += 1;
  }
  return created;
}

async function seedDefaultCashAccounts(): Promise<number> {
  const count = await prisma.cashBankAccount.count();
  if (count > 0) return 0;

  const cashLedger = await prisma.chartOfAccount.findUnique({ where: { code: ACCOUNT_CODES.CASH_IN_HAND } });
  const bankLedger = await prisma.chartOfAccount.findUnique({ where: { code: ACCOUNT_CODES.BANK_ACCOUNTS } });
  const gatewayLedger = await prisma.chartOfAccount.findUnique({
    where: { code: ACCOUNT_CODES.PAYMENT_GATEWAY_RECEIVABLE },
  });
  if (!cashLedger || !bankLedger || !gatewayLedger) return 0;

  const company = await prisma.companyProfile.findUnique({ where: { id: 'default' } });

  await prisma.cashBankAccount.createMany({
    data: [
      {
        code: 'CASH-COUNTER',
        name: 'Counter Cash',
        type: 'CASH',
        ledgerAccountId: cashLedger.id,
        isDefaultCash: true,
      },
      {
        code: 'BANK-MAIN',
        name: company?.bankName ? `${company.bankName} — Current` : 'Main Bank Account',
        type: 'BANK',
        ledgerAccountId: bankLedger.id,
        bankName: company?.bankName || null,
        accountNumber: company?.bankAccount || null,
        ifsc: company?.bankIfsc || null,
        branch: company?.bankBranch || null,
        isDefaultBank: true,
      },
      {
        code: 'GATEWAY-RAZORPAY',
        name: 'Razorpay Settlement',
        type: 'PAYMENT_GATEWAY',
        ledgerAccountId: gatewayLedger.id,
      },
    ],
  });
  return 3;
}

async function main(): Promise<void> {
  const backfill = !process.argv.includes('--no-backfill');

  logger.info('▸ Installing chart of accounts…');
  const chart = await ensureChartOfAccounts();
  accountResolver.invalidate();
  logger.info(`  ${chart.created} accounts created, ${chart.total} total`);

  logger.info('▸ Aligning finance settings with the company profile…');
  const company = await prisma.companyProfile.findUnique({ where: { id: 'default' } });
  const homeStateCode = company?.stateCode?.trim() || company?.gstin?.slice(0, 2) || '24';
  await financeSettingsService.update({ homeStateCode });
  logger.info(`  Home state code set to ${homeStateCode}`);

  logger.info('▸ Creating the fiscal calendar…');
  const fiscalYear = await fiscalService.currentFiscalYear();
  await fiscalService.ensureYear(fiscalYear);
  await fiscalService.ensureYear(fiscalYear - 1);
  logger.info(`  FY ${fiscalService.fiscalYearLabel(fiscalYear)} ready`);

  logger.info('▸ Seeding expense categories…');
  logger.info(`  ${await seedExpenseCategories()} categories created`);

  logger.info('▸ Seeding cash & bank accounts…');
  logger.info(`  ${await seedDefaultCashAccounts()} accounts created`);

  logger.info('▸ Deriving GST detail for existing invoices…');
  const invoices = await prisma.invoice.findMany({ where: { taxDetailReady: false }, select: { id: true } });
  const derived = await invoiceTaxService.ensureManyTaxDetails(invoices.map((i) => i.id));
  logger.info(`  ${derived} of ${invoices.length} invoices enriched`);

  if (backfill) {
    logger.info('▸ Backfilling the journal from every existing source document…');
    logger.info('  (idempotent — safe to interrupt and re-run)');
    let pass = 1;
    for (;;) {
      const summary = await runAccountingProjection({
        batchSize: 2000,
        trigger: 'backfill',
        silent: pass > 1,
      });
      logger.info(`  pass ${pass}: ${summary.posted} posted, ${summary.skipped} already present, ${summary.errorCount} errors`);
      if (summary.errorCount > 0) {
        for (const outcome of summary.outcomes) {
          for (const error of outcome.errors.slice(0, 5)) {
            logger.warn(`    ${outcome.adapter} · ${error.sourceId}: ${error.message}`);
          }
        }
      }
      // Stop once a whole pass posts nothing new — every source document is in the books.
      if (summary.posted === 0) break;
      pass += 1;
      if (pass > 50) {
        logger.warn('  Stopping after 50 passes — investigate the errors above.');
        break;
      }
    }
  }

  logger.info('▸ Verifying…');
  const trialBalance = await trialBalanceService.build({ from: new Date(2000, 0, 1), to: new Date() });
  logger.info(`  Trial balance: debits ${trialBalance.totals.debit.toFixed(2)} · credits ${trialBalance.totals.credit.toFixed(2)}`);
  if (trialBalance.isBalanced) {
    logger.info('  ✓ The books balance.');
  } else {
    logger.error(`  ✗ OUT OF BALANCE by ${trialBalance.totals.difference.toFixed(2)} — investigate before relying on reports.`);
  }

  const entryCount = await prisma.journalEntry.count();
  logger.info(`  ${entryCount} journal entries in the books.`);
}

main()
  .catch((error: unknown) => {
    logger.error('Accounting setup failed', { error: error instanceof Error ? error.stack : String(error) });
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

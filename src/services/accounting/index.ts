/**
 * The accounting domain's public surface.
 *
 * Modules outside this folder should import from here and nowhere deeper — that boundary is what
 * lets the internals (posting rules, adapters, report shapes) be reorganised without a
 * cross-cutting refactor.
 */
export { ACCOUNT_CODES, type AccountCode } from './account-codes.js';
export { CHART_OF_ACCOUNTS_SEED, ensureChartOfAccounts, normalBalanceFor } from './chart-of-accounts.seed.js';
export { accountResolver } from './account-resolver.service.js';
export { financeSettingsService } from './finance-settings.service.js';
export { fiscalService, type FiscalCoordinates } from './fiscal.service.js';
export { postingService, type PostEntryInput, type PostingLineInput, type PostResult } from './posting.service.js';
export { allocateVoucherNumber, VOUCHER_SERIES, type VoucherSeries } from './voucher-number.service.js';
export { gstService, stateCodeFromGstin, isStructurallyValidGstin, type GstSplit } from './gst.service.js';
export { invoiceTaxService } from './invoice-tax.service.js';
export { GST_STATE_CODES, stateCodeFromName, stateNameFromCode } from './india-states.js';
export {
  resolveAccountCode,
  resolveCodeForPaymentMode,
  resolveDefaultBankAccountCode,
  resolveDefaultCashAccountCode,
} from './cash-account.resolver.js';

export {
  runAccountingProjection,
  syncAccountingFor,
  PROJECTION_ADAPTERS,
  type ProjectionRunSummary,
  type RunProjectionOptions,
} from './projection/index.js';

export { trialBalanceService, type TrialBalance } from './reporting/trial-balance.service.js';
export { profitLossService, type ProfitAndLoss } from './reporting/profit-loss.service.js';
export { balanceSheetService, type BalanceSheet } from './reporting/balance-sheet.service.js';
export { cashFlowService, type CashFlowReport } from './reporting/cash-flow.service.js';
export { dayBookService, type DayBookQuery } from './reporting/day-book.service.js';
export { ageingService, type AgeingReport } from './reporting/ageing.service.js';
export { partyStatementService, type PartyStatement } from './reporting/party-statement.service.js';
export { gstReturnsService, type Gstr1Report, type Gstr3bReport } from './reporting/gst-returns.service.js';
export { reconciliationService, type ReconciliationReport } from './reporting/reconciliation.service.js';
export { normaliseRange, round2 } from './reporting/report.types.js';

export { financeExportService, type ExportPack } from './export/finance-export.service.js';
export { WorkbookBuilder, toCsv, type SheetSpec } from './export/workbook.builder.js';

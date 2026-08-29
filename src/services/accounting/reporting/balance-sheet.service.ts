import { AccountSubType, AccountType } from '@prisma/client';
import { fiscalService } from '../fiscal.service.js';
import { type AccountBalanceRow, type ReportSection, round2 } from './report.types.js';
import { profitLossService } from './profit-loss.service.js';
import { trialBalanceService } from './trial-balance.service.js';

export interface BalanceSheet {
  asAt: string;
  assets: {
    current: ReportSection;
    fixed: ReportSection;
    total: number;
  };
  liabilities: {
    current: ReportSection;
    longTerm: ReportSection;
    total: number;
  };
  equity: {
    section: ReportSection;
    currentYearEarnings: number;
    total: number;
  };
  totals: {
    assets: number;
    liabilitiesAndEquity: number;
    difference: number;
  };
  isBalanced: boolean;
}

const CURRENT_ASSET_SUBTYPES: AccountSubType[] = [
  AccountSubType.CASH,
  AccountSubType.BANK,
  AccountSubType.PAYMENT_GATEWAY,
  AccountSubType.ACCOUNTS_RECEIVABLE,
  AccountSubType.CREDIT_RECEIVABLE,
  AccountSubType.INVENTORY,
  AccountSubType.PREPAID_EXPENSE,
  AccountSubType.ADVANCE_TO_SUPPLIER,
  AccountSubType.INPUT_TAX,
  AccountSubType.OTHER_CURRENT_ASSET,
];

const LONG_TERM_LIABILITY_SUBTYPES: AccountSubType[] = [AccountSubType.LOAN];

function section(key: string, title: string, rows: AccountBalanceRow[]): ReportSection {
  const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code));
  return { key, title, rows: sorted, total: round2(sorted.reduce((s, r) => s + r.balance, 0)) };
}

/**
 * The balance sheet — what the business owns, what it owes, and what is left over for the owner,
 * as at a date.
 *
 * The piece that is easy to get wrong is current-year earnings. Profit is not stored anywhere; it
 * is the running total of income minus expenses since the start of the fiscal year, and it belongs
 * on the equity side. Compute it, do not accrue it into an account — that way the balance sheet
 * cannot drift from the P&L, and `isBalanced` becomes a real assertion about the books rather than
 * a formatting exercise.
 */
export class BalanceSheetService {
  async build(options: { asAt?: Date } = {}): Promise<BalanceSheet> {
    const asAt = options.asAt ? new Date(options.asAt) : new Date();
    asAt.setHours(23, 59, 59, 999);

    const balances = await trialBalanceService.balancesAsAt(asAt, {
      types: [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY],
    });
    const rows = [...balances.values()];

    const currentAssets = rows.filter(
      (r) => r.type === AccountType.ASSET && CURRENT_ASSET_SUBTYPES.includes(r.subType as AccountSubType),
    );
    const fixedAssets = rows.filter(
      (r) =>
        r.type === AccountType.ASSET &&
        (r.subType === AccountSubType.FIXED_ASSET || r.subType === AccountSubType.ACCUMULATED_DEPRECIATION),
    );
    const longTermLiabilities = rows.filter(
      (r) => r.type === AccountType.LIABILITY && LONG_TERM_LIABILITY_SUBTYPES.includes(r.subType as AccountSubType),
    );
    const currentLiabilities = rows.filter(
      (r) => r.type === AccountType.LIABILITY && !LONG_TERM_LIABILITY_SUBTYPES.includes(r.subType as AccountSubType),
    );
    const equityRows = rows.filter((r) => r.type === AccountType.EQUITY);

    // Profit from the start of the fiscal year that `asAt` falls in, up to `asAt`.
    const coords = await fiscalService.coordinatesFor(asAt);
    const bounds = await fiscalService.yearBounds(coords.fiscalYear);
    const currentYearEarnings = await profitLossService.netProfitBetween(bounds.from, asAt);

    const currentAssetsSection = section('current_assets', 'Current Assets', currentAssets);
    const fixedAssetsSection = section('fixed_assets', 'Fixed Assets', fixedAssets);
    const currentLiabilitiesSection = section('current_liabilities', 'Current Liabilities', currentLiabilities);
    const longTermSection = section('long_term_liabilities', 'Long-term Liabilities', longTermLiabilities);
    const equitySection = section('equity', "Owner's Equity", equityRows);

    const totalAssets = round2(currentAssetsSection.total + fixedAssetsSection.total);
    const totalLiabilities = round2(currentLiabilitiesSection.total + longTermSection.total);
    const totalEquity = round2(equitySection.total + currentYearEarnings);
    const liabilitiesAndEquity = round2(totalLiabilities + totalEquity);

    return {
      asAt: asAt.toISOString(),
      assets: { current: currentAssetsSection, fixed: fixedAssetsSection, total: totalAssets },
      liabilities: { current: currentLiabilitiesSection, longTerm: longTermSection, total: totalLiabilities },
      equity: { section: equitySection, currentYearEarnings, total: totalEquity },
      totals: {
        assets: totalAssets,
        liabilitiesAndEquity,
        difference: round2(totalAssets - liabilitiesAndEquity),
      },
      isBalanced: Math.abs(totalAssets - liabilitiesAndEquity) < 0.01,
    };
  }
}

export const balanceSheetService = new BalanceSheetService();

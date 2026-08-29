import { AccountSubType, AccountType } from '@prisma/client';
import { type AccountBalanceRow, type ReportSection, normaliseRange, round2 } from './report.types.js';
import { trialBalanceService } from './trial-balance.service.js';

export interface ProfitAndLoss {
  range: { from: string; to: string };
  revenue: ReportSection;
  salesReturns: ReportSection;
  costOfSales: ReportSection;
  operatingExpenses: ReportSection;
  otherIncome: ReportSection;
  summary: {
    grossRevenue: number;
    netRevenue: number;
    costOfSales: number;
    grossProfit: number;
    grossMarginPercent: number;
    operatingExpenses: number;
    operatingProfit: number;
    otherIncome: number;
    netProfit: number;
    netMarginPercent: number;
  };
  comparison?: ProfitAndLoss['summary'] & { label: string };
}

const REVENUE_SUBTYPES: AccountSubType[] = [
  AccountSubType.SALES_REVENUE,
  AccountSubType.SERVICE_REVENUE,
];
const COST_SUBTYPES: AccountSubType[] = [
  AccountSubType.COST_OF_GOODS_SOLD,
  AccountSubType.DIRECT_EXPENSE,
];

function section(key: string, title: string, rows: AccountBalanceRow[]): ReportSection {
  return { key, title, rows, total: round2(rows.reduce((s, r) => s + r.balance, 0)) };
}

/**
 * Profit & loss for a period.
 *
 * Built entirely from the journal rather than from orders or invoices, which is the point: an
 * expense recorded by hand, a credit note, and a dispatch invoice all reach this report through
 * the same door, so the profit figure accounts for every rupee the business actually moved rather
 * than only the ones the sales flow knows about.
 *
 * Sales returns are shown as a deduction from gross revenue rather than as a cost, because a
 * refunded job never was income — presenting it as an expense flatters both revenue and costs.
 */
export class ProfitLossService {
  async build(options: { from?: Date; to?: Date; compareWith?: { from: Date; to: Date; label: string } }): Promise<ProfitAndLoss> {
    const range = normaliseRange(options.from, options.to);
    const summaryFor = async (from: Date, to: Date) => {
      const balances = await trialBalanceService.balancesAsAt(to, {
        from,
        types: [AccountType.INCOME, AccountType.EXPENSE],
      });
      const rows = [...balances.values()];

      const revenue = rows.filter((r) => REVENUE_SUBTYPES.includes(r.subType as AccountSubType));
      const returns = rows.filter((r) => r.subType === AccountSubType.SALES_RETURN);
      const otherIncome = rows.filter((r) => r.subType === AccountSubType.OTHER_INCOME);
      const cost = rows.filter((r) => COST_SUBTYPES.includes(r.subType as AccountSubType));
      const opex = rows.filter(
        (r) =>
          r.type === AccountType.EXPENSE &&
          !COST_SUBTYPES.includes(r.subType as AccountSubType),
      );

      return { revenue, returns, otherIncome, cost, opex };
    };

    const parts = await summaryFor(range.from, range.to);

    const revenueSection = section('revenue', 'Revenue', parts.revenue);
    // Sales-return accounts are INCOME-typed contras, so their natural balance is negative here;
    // present the magnitude and subtract it explicitly.
    const returnsSection = section('sales_returns', 'Less: Sales Returns & Credit Notes', parts.returns);
    const costSection = section('cost_of_sales', 'Cost of Sales', parts.cost);
    const opexSection = section('operating_expenses', 'Operating Expenses', parts.opex);
    const otherIncomeSection = section('other_income', 'Other Income', parts.otherIncome);

    const grossRevenue = revenueSection.total;
    const returnsTotal = Math.abs(returnsSection.total);
    const netRevenue = round2(grossRevenue - returnsTotal);
    const costTotal = costSection.total;
    const grossProfit = round2(netRevenue - costTotal);
    const opexTotal = opexSection.total;
    const operatingProfit = round2(grossProfit - opexTotal);
    const otherIncomeTotal = otherIncomeSection.total;
    const netProfit = round2(operatingProfit + otherIncomeTotal);

    const summary = {
      grossRevenue,
      netRevenue,
      costOfSales: costTotal,
      grossProfit,
      grossMarginPercent: netRevenue === 0 ? 0 : round2((grossProfit / netRevenue) * 100),
      operatingExpenses: opexTotal,
      operatingProfit,
      otherIncome: otherIncomeTotal,
      netProfit,
      netMarginPercent: netRevenue === 0 ? 0 : round2((netProfit / netRevenue) * 100),
    };

    const report: ProfitAndLoss = {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      revenue: revenueSection,
      salesReturns: { ...returnsSection, total: returnsTotal },
      costOfSales: costSection,
      operatingExpenses: opexSection,
      otherIncome: otherIncomeSection,
      summary,
    };

    if (options.compareWith) {
      const prior = await this.build({ from: options.compareWith.from, to: options.compareWith.to });
      report.comparison = { ...prior.summary, label: options.compareWith.label };
    }

    return report;
  }

  /** Net profit for a period — the number the balance sheet needs for current-year earnings. */
  async netProfitBetween(from: Date, to: Date): Promise<number> {
    const pl = await this.build({ from, to });
    return pl.summary.netProfit;
  }
}

export const profitLossService = new ProfitLossService();

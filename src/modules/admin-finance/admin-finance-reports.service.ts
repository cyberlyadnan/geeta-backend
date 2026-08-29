import { prisma } from '../../config/database.js';
import {
  ageingService,
  balanceSheetService,
  cashFlowService,
  financeExportService,
  gstReturnsService,
  partyStatementService,
  profitLossService,
  reconciliationService,
  trialBalanceService,
} from '../../services/accounting/index.js';
import type {
  AgeingQuery,
  BalanceSheetQuery,
  ExportQuery,
  PartyStatementQuery,
  ProfitLossQuery,
  ReportRange,
  TrialBalanceQuery,
} from './admin-finance-reports.validation.js';

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * The reporting surface the admin finance screens read from.
 *
 * Everything here is a thin pass-through to the accounting services. That thinness is deliberate:
 * report logic that lives in a controller cannot be reused by the Excel export, and the two then
 * drift until the file the CA receives disagrees with the screen the owner approved.
 */
export class AdminFinanceReportsService {
  trialBalance(query: TrialBalanceQuery) {
    return trialBalanceService.build(query);
  }

  async profitLoss(query: ProfitLossQuery) {
    const compareWith = this.comparisonRange(query);
    return profitLossService.build({ from: query.from, to: query.to, compareWith });
  }

  balanceSheet(query: BalanceSheetQuery) {
    return balanceSheetService.build({ asAt: query.asAt });
  }

  cashFlow(query: ReportRange) {
    return cashFlowService.build(query);
  }

  ageing(query: AgeingQuery) {
    const asAt = query.asAt ?? new Date();
    return query.kind === 'payable' ? ageingService.payables(asAt) : ageingService.receivables(asAt);
  }

  partyStatement(query: PartyStatementQuery) {
    return partyStatementService.build(query);
  }

  gstr1(query: ReportRange) {
    return gstReturnsService.gstr1(query);
  }

  gstr3b(query: ReportRange) {
    return gstReturnsService.gstr3b(query);
  }

  purchaseRegister(query: ReportRange) {
    return gstReturnsService.purchaseRegister(query);
  }

  reconciliation(query: ReportRange) {
    return reconciliationService.build(query);
  }

  export(query: ExportQuery, generatedBy?: string) {
    return financeExportService.build(query.pack, { from: query.from, to: query.to, generatedBy });
  }

  /**
   * The finance home screen: the handful of numbers an owner checks daily, in one round of
   * queries. Deliberately answers "how is the business doing" rather than "what does the ledger
   * contain" — the ledger has its own screen.
   */
  async dashboard(query: ReportRange) {
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getFullYear(), to.getMonth(), 1);

    const [pnl, cashFlow, receivables, payables, gst, reconciliation, recentEntries] = await Promise.all([
      profitLossService.build({ from, to }),
      cashFlowService.build({ from, to }),
      ageingService.receivables(to),
      ageingService.payables(to),
      gstReturnsService.gstr3b({ from, to }),
      reconciliationService.build({ from, to }),
      prisma.journalEntry.findMany({
        where: { entryDate: { gte: from, lte: to }, status: 'POSTED' },
        orderBy: { entryDate: 'desc' },
        take: 8,
        select: {
          id: true,
          voucherNumber: true,
          entryDate: true,
          narration: true,
          sourceType: true,
          partyName: true,
          totalDebit: true,
        },
      }),
    ]);

    const overdueReceivables = round2(
      receivables.rows.reduce(
        (sum, row) => sum + row.buckets.slice(1).reduce((s, bucket) => s + bucket.amount, 0),
        0,
      ),
    );

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      performance: {
        revenue: pnl.summary.netRevenue,
        costOfSales: pnl.summary.costOfSales,
        grossProfit: pnl.summary.grossProfit,
        grossMarginPercent: pnl.summary.grossMarginPercent,
        expenses: pnl.summary.operatingExpenses,
        netProfit: pnl.summary.netProfit,
        netMarginPercent: pnl.summary.netMarginPercent,
      },
      cash: {
        opening: cashFlow.openingBalance,
        closing: cashFlow.closingBalance,
        inflow: cashFlow.totals.inflow,
        outflow: cashFlow.totals.outflow,
        net: cashFlow.totals.net,
        daily: cashFlow.daily.slice(-30),
      },
      receivables: {
        total: receivables.totals.total,
        overdue: overdueReceivables,
        customerCount: receivables.rows.length,
        top: receivables.rows.slice(0, 5),
      },
      payables: {
        total: payables.totals.total,
        supplierCount: payables.rows.length,
        top: payables.rows.slice(0, 5),
      },
      gst: {
        outputTax: round2(
          gst.outward.taxableSupplies.cgst + gst.outward.taxableSupplies.sgst + gst.outward.taxableSupplies.igst,
        ),
        inputCredit: round2(
          gst.inward.itcAvailable.cgst + gst.inward.itcAvailable.sgst + gst.inward.itcAvailable.igst,
        ),
        netPayable: gst.netPayable.total,
        taxableSupplies: gst.outward.taxableSupplies.taxableValue,
      },
      health: {
        status: reconciliation.overallStatus,
        checks: reconciliation.checks,
        unpostedDocuments: reconciliation.unpostedDocuments,
      },
      recentEntries: recentEntries.map((entry) => ({
        id: entry.id,
        voucherNumber: entry.voucherNumber,
        entryDate: entry.entryDate.toISOString(),
        narration: entry.narration,
        sourceType: entry.sourceType,
        partyName: entry.partyName,
        amount: round2(Number(entry.totalDebit)),
      })),
    };
  }

  private comparisonRange(query: ProfitLossQuery) {
    if (query.compare === 'none' || !query.from || !query.to) return undefined;

    if (query.compare === 'previous-year') {
      const from = new Date(query.from);
      const to = new Date(query.to);
      from.setFullYear(from.getFullYear() - 1);
      to.setFullYear(to.getFullYear() - 1);
      return { from, to, label: 'Same period last year' };
    }

    const span = query.to.getTime() - query.from.getTime();
    return {
      from: new Date(query.from.getTime() - span - 1),
      to: new Date(query.from.getTime() - 1),
      label: 'Previous period',
    };
  }
}

export const adminFinanceReportsService = new AdminFinanceReportsService();

import { prisma } from '../../../config/database.js';
import { ageingService } from '../reporting/ageing.service.js';
import { balanceSheetService } from '../reporting/balance-sheet.service.js';
import { cashFlowService } from '../reporting/cash-flow.service.js';
import { dayBookService } from '../reporting/day-book.service.js';
import { gstReturnsService } from '../reporting/gst-returns.service.js';
import { profitLossService } from '../reporting/profit-loss.service.js';
import { trialBalanceService } from '../reporting/trial-balance.service.js';
import { WorkbookBuilder, type SheetSpec } from './workbook.builder.js';

export type ExportPack =
  | 'ca-handover'
  | 'gst-returns'
  | 'financial-statements'
  | 'day-book'
  | 'ageing'
  | 'tally';

export interface ExportOptions {
  from?: Date;
  to?: Date;
  generatedBy?: string;
}

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function periodLabel(from?: Date, to?: Date): string {
  return `${from ? fmtDate(from) : 'Beginning'} to ${to ? fmtDate(to) : fmtDate(new Date())}`;
}

/**
 * Builds the Excel deliverables.
 *
 * The one that matters most is `ca-handover`: a single workbook containing everything a chartered
 * accountant needs to file a return or close a year — trial balance, P&L, balance sheet, day book,
 * sales and purchase registers, GST tables, and ageing — each on its own sheet, each tying to the
 * others. The alternative, which most businesses live with, is emailing a CA nine separate files
 * that disagree with each other.
 */
export class FinanceExportService {
  async build(pack: ExportPack, options: ExportOptions): Promise<{ buffer: Buffer; filename: string }> {
    const company = await prisma.companyProfile.findUnique({ where: { id: 'default' } });
    const builder = new WorkbookBuilder({
      // Empty strings are the CompanyProfile default, so fall back on blank as well as on null.
      companyName: company?.companyName?.trim() ? company.companyName : 'Geeta Printers',
      gstin: company?.gstin?.trim() ? company.gstin : null,
      generatedBy: options.generatedBy,
    });

    const sheets = await this.sheetsFor(pack, options);
    for (const sheet of sheets) builder.addSheet(sheet);

    return {
      buffer: await builder.toBuffer(),
      filename: `${pack}-${fmtDate(options.from) || 'all'}-to-${fmtDate(options.to) || fmtDate(new Date())}.xlsx`,
    };
  }

  private async sheetsFor(pack: ExportPack, options: ExportOptions): Promise<SheetSpec[]> {
    switch (pack) {
      case 'ca-handover':
        return [
          ...(await this.financialStatementSheets(options)),
          ...(await this.gstSheets(options)),
          await this.dayBookSheet(options),
          ...(await this.ageingSheets(options)),
        ];
      case 'financial-statements':
        return this.financialStatementSheets(options);
      case 'gst-returns':
        return this.gstSheets(options);
      case 'day-book':
        return [await this.dayBookSheet(options)];
      case 'ageing':
        return this.ageingSheets(options);
      case 'tally':
        return [await this.tallySheet(options)];
      default:
        return [];
    }
  }

  private async financialStatementSheets(options: ExportOptions): Promise<SheetSpec[]> {
    const period = periodLabel(options.from, options.to);
    const [trialBalance, pnl, balanceSheet, cashFlow] = await Promise.all([
      trialBalanceService.build({ from: options.from, to: options.to }),
      profitLossService.build({ from: options.from, to: options.to }),
      balanceSheetService.build({ asAt: options.to }),
      cashFlowService.build({ from: options.from, to: options.to }),
    ]);

    const trialBalanceSheet: SheetSpec = {
      name: 'Trial Balance',
      title: 'Trial Balance',
      subtitle: period,
      columns: [
        { header: 'Code', key: 'code', width: 10 },
        { header: 'Account', key: 'name', width: 38 },
        { header: 'Type', key: 'type', width: 14 },
        { header: 'Debit', key: 'debit', format: 'money' },
        { header: 'Credit', key: 'credit', format: 'money' },
      ],
      rows: trialBalance.rows.map((r) => ({ code: r.code, name: r.name, type: r.type, debit: r.debit, credit: r.credit })),
      totalsRow: { code: '', name: 'TOTAL', type: '', debit: trialBalance.totals.debit, credit: trialBalance.totals.credit },
      notes: [
        trialBalance.isBalanced
          ? 'Debits equal credits — the books are internally consistent.'
          : `OUT OF BALANCE by ${trialBalance.totals.difference.toFixed(2)}. Investigate before filing.`,
      ],
    };

    const blank = { particulars: '', amount: null };
    const pnlRows: Record<string, string | number | null>[] = [];
    const pushSection = (title: string, rows: { code: string; name: string; balance: number }[], total: number) => {
      pnlRows.push({ particulars: title, amount: null });
      for (const row of rows) pnlRows.push({ particulars: `    ${row.code} · ${row.name}`, amount: row.balance });
      pnlRows.push({ particulars: `  Total ${title}`, amount: total }, { ...blank });
    };
    pushSection('Revenue', pnl.revenue.rows, pnl.revenue.total);
    pushSection('Less: Sales Returns', pnl.salesReturns.rows, pnl.salesReturns.total);
    pnlRows.push({ particulars: 'NET REVENUE', amount: pnl.summary.netRevenue }, { ...blank });
    pushSection('Cost of Sales', pnl.costOfSales.rows, pnl.costOfSales.total);
    pnlRows.push({ particulars: 'GROSS PROFIT', amount: pnl.summary.grossProfit }, { ...blank });
    pushSection('Operating Expenses', pnl.operatingExpenses.rows, pnl.operatingExpenses.total);
    pnlRows.push({ particulars: 'OPERATING PROFIT', amount: pnl.summary.operatingProfit }, { ...blank });
    pushSection('Other Income', pnl.otherIncome.rows, pnl.otherIncome.total);

    const pnlSheet: SheetSpec = {
      name: 'Profit and Loss',
      title: 'Profit & Loss Statement',
      subtitle: period,
      columns: [
        { header: 'Particulars', key: 'particulars', width: 52 },
        { header: 'Amount (INR)', key: 'amount', format: 'money', width: 18 },
      ],
      rows: pnlRows,
      totalsRow: { particulars: 'NET PROFIT', amount: pnl.summary.netProfit },
      notes: [
        `Gross margin ${pnl.summary.grossMarginPercent.toFixed(2)}% · Net margin ${pnl.summary.netMarginPercent.toFixed(2)}%`,
      ],
    };

    const bsRows: Record<string, string | number | null>[] = [];
    const pushBs = (title: string, rows: { code: string; name: string; balance: number }[], total: number) => {
      bsRows.push({ particulars: title, amount: null });
      for (const row of rows) bsRows.push({ particulars: `    ${row.code} · ${row.name}`, amount: row.balance });
      bsRows.push({ particulars: `  Total ${title}`, amount: total }, { ...blank });
    };
    pushBs('Current Assets', balanceSheet.assets.current.rows, balanceSheet.assets.current.total);
    pushBs('Fixed Assets', balanceSheet.assets.fixed.rows, balanceSheet.assets.fixed.total);
    bsRows.push({ particulars: 'TOTAL ASSETS', amount: balanceSheet.totals.assets }, { ...blank });
    pushBs('Current Liabilities', balanceSheet.liabilities.current.rows, balanceSheet.liabilities.current.total);
    pushBs('Long-term Liabilities', balanceSheet.liabilities.longTerm.rows, balanceSheet.liabilities.longTerm.total);
    pushBs("Owner's Equity", balanceSheet.equity.section.rows, balanceSheet.equity.section.total);
    bsRows.push({ particulars: '    Current year earnings', amount: balanceSheet.equity.currentYearEarnings });
    bsRows.push({ particulars: '  Total Equity', amount: balanceSheet.equity.total });

    const balanceSheetSheet: SheetSpec = {
      name: 'Balance Sheet',
      title: 'Balance Sheet',
      subtitle: `As at ${fmtDate(balanceSheet.asAt)}`,
      columns: [
        { header: 'Particulars', key: 'particulars', width: 52 },
        { header: 'Amount (INR)', key: 'amount', format: 'money', width: 18 },
      ],
      rows: bsRows,
      totalsRow: { particulars: 'TOTAL LIABILITIES AND EQUITY', amount: balanceSheet.totals.liabilitiesAndEquity },
      notes: [
        balanceSheet.isBalanced
          ? 'Assets equal liabilities plus equity.'
          : `OUT OF BALANCE by ${balanceSheet.totals.difference.toFixed(2)}.`,
      ],
    };

    const cashFlowSheet: SheetSpec = {
      name: 'Cash Flow',
      title: 'Cash Flow Summary',
      subtitle: period,
      columns: [
        { header: 'Source', key: 'source', width: 32 },
        { header: 'Inflow', key: 'inflow', format: 'money' },
        { header: 'Outflow', key: 'outflow', format: 'money' },
      ],
      rows: [
        ...cashFlow.inflows.map((r) => ({ source: r.source, inflow: r.amount, outflow: 0 })),
        ...cashFlow.outflows.map((r) => ({ source: r.source, inflow: 0, outflow: r.amount })),
      ],
      totalsRow: { source: 'TOTAL', inflow: cashFlow.totals.inflow, outflow: cashFlow.totals.outflow },
      notes: [
        `Opening cash & bank ${cashFlow.openingBalance.toFixed(2)} · Closing ${cashFlow.closingBalance.toFixed(2)}`,
      ],
    };

    return [trialBalanceSheet, pnlSheet, balanceSheetSheet, cashFlowSheet];
  }

  private async gstSheets(options: ExportOptions): Promise<SheetSpec[]> {
    const period = periodLabel(options.from, options.to);
    const [gstr1, gstr3b, purchases] = await Promise.all([
      gstReturnsService.gstr1({ from: options.from, to: options.to }),
      gstReturnsService.gstr3b({ from: options.from, to: options.to }),
      gstReturnsService.purchaseRegister({ from: options.from, to: options.to }),
    ]);

    const invoiceColumns = [
      { header: 'GSTIN of recipient', key: 'gstin', width: 20 },
      { header: 'Receiver name', key: 'receiverName', width: 30 },
      { header: 'Invoice number', key: 'invoiceNumber', width: 20 },
      { header: 'Invoice date', key: 'invoiceDate', format: 'date' as const },
      { header: 'Invoice value', key: 'invoiceValue', format: 'money' as const },
      { header: 'Place of supply', key: 'pos', width: 22 },
      { header: 'Reverse charge', key: 'reverseCharge', width: 14 },
      { header: 'Rate', key: 'rate', format: 'percent' as const },
      { header: 'Taxable value', key: 'taxableValue', format: 'money' as const },
      { header: 'CGST', key: 'cgst', format: 'money' as const },
      { header: 'SGST', key: 'sgst', format: 'money' as const },
      { header: 'IGST', key: 'igst', format: 'money' as const },
      { header: 'Cess', key: 'cess', format: 'money' as const },
    ];

    const withPos = <T extends { placeOfSupply: string; placeOfSupplyName: string | null }>(row: T) => ({
      ...row,
      pos: row.placeOfSupply ? `${row.placeOfSupply}-${row.placeOfSupplyName ?? ''}` : '',
    });
    const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((s, r) => s + pick(r), 0);

    return [
      {
        name: 'GSTR1 B2B',
        title: 'GSTR-1 · Table 4 — B2B Invoices',
        subtitle: period,
        columns: invoiceColumns,
        rows: gstr1.b2b.map(withPos),
        totalsRow: {
          receiverName: `${String(gstr1.b2b.length)} invoices`,
          invoiceValue: sum(gstr1.b2b, (r) => r.invoiceValue),
          taxableValue: sum(gstr1.b2b, (r) => r.taxableValue),
          cgst: sum(gstr1.b2b, (r) => r.cgst),
          sgst: sum(gstr1.b2b, (r) => r.sgst),
          igst: sum(gstr1.b2b, (r) => r.igst),
        },
      },
      {
        name: 'GSTR1 B2CL',
        title: 'GSTR-1 · Table 5 — B2C Large (inter-state, above threshold)',
        subtitle: period,
        columns: invoiceColumns,
        rows: gstr1.b2cl.map(withPos),
      },
      {
        name: 'GSTR1 B2CS',
        title: 'GSTR-1 · Table 7 — B2C Small (consolidated by state and rate)',
        subtitle: period,
        columns: [
          { header: 'Place of supply', key: 'pos', width: 24 },
          { header: 'Rate', key: 'rate', format: 'percent' },
          { header: 'Taxable value', key: 'taxableValue', format: 'money' },
          { header: 'CGST', key: 'cgst', format: 'money' },
          { header: 'SGST', key: 'sgst', format: 'money' },
          { header: 'IGST', key: 'igst', format: 'money' },
        ],
        rows: gstr1.b2cs.map(withPos),
        totalsRow: {
          pos: 'TOTAL',
          taxableValue: sum(gstr1.b2cs, (r) => r.taxableValue),
          cgst: sum(gstr1.b2cs, (r) => r.cgst),
          sgst: sum(gstr1.b2cs, (r) => r.sgst),
          igst: sum(gstr1.b2cs, (r) => r.igst),
        },
      },
      {
        name: 'GSTR1 Credit Notes',
        title: 'GSTR-1 · Table 9 — Credit / Debit Notes',
        subtitle: period,
        columns: [
          ...invoiceColumns,
          { header: 'Original invoice', key: 'originalInvoiceNumber', width: 20 },
          { header: 'Reason', key: 'noteReason', width: 22 },
        ],
        rows: gstr1.creditNotes.map(withPos),
        totalsRow: {
          receiverName: `${String(gstr1.creditNotes.length)} credit notes`,
          taxableValue: sum(gstr1.creditNotes, (r) => r.taxableValue),
          invoiceValue: sum(gstr1.creditNotes, (r) => r.invoiceValue),
        },
      },
      {
        name: 'HSN Summary',
        title: 'GSTR-1 · Table 12 — HSN-wise Summary',
        subtitle: period,
        columns: [
          { header: 'HSN / SAC', key: 'hsnCode', width: 14 },
          { header: 'Description', key: 'description', width: 34 },
          { header: 'UQC', key: 'uom', width: 10 },
          { header: 'Quantity', key: 'quantity', format: 'number' },
          { header: 'Taxable value', key: 'taxableValue', format: 'money' },
          { header: 'CGST', key: 'cgst', format: 'money' },
          { header: 'SGST', key: 'sgst', format: 'money' },
          { header: 'IGST', key: 'igst', format: 'money' },
          { header: 'Total value', key: 'total', format: 'money' },
        ],
        rows: gstr1.hsnSummary,
        totalsRow: {
          hsnCode: 'TOTAL',
          taxableValue: sum(gstr1.hsnSummary, (r) => r.taxableValue),
          cgst: sum(gstr1.hsnSummary, (r) => r.cgst),
          sgst: sum(gstr1.hsnSummary, (r) => r.sgst),
          igst: sum(gstr1.hsnSummary, (r) => r.igst),
          total: sum(gstr1.hsnSummary, (r) => r.total),
        },
      },
      {
        name: 'Purchase Register',
        title: 'Purchase & Expense Register — for GSTR-2B reconciliation',
        subtitle: period,
        columns: [
          { header: 'Date', key: 'date', format: 'date' },
          { header: 'Type', key: 'kind', width: 16 },
          { header: 'Supplier', key: 'supplierName', width: 30 },
          { header: 'Supplier GSTIN', key: 'supplierGstin', width: 20 },
          { header: 'Supplier document no.', key: 'documentNumber', width: 22 },
          { header: 'Our reference', key: 'internalNumber', width: 18 },
          { header: 'Particulars', key: 'description', width: 26 },
          { header: 'Taxable value', key: 'taxableValue', format: 'money' },
          { header: 'CGST', key: 'cgst', format: 'money' },
          { header: 'SGST', key: 'sgst', format: 'money' },
          { header: 'IGST', key: 'igst', format: 'money' },
          { header: 'Total', key: 'total', format: 'money' },
          { header: 'ITC eligible', key: 'itcEligible', width: 12 },
        ],
        rows: purchases.rows.map((r) => ({ ...r, itcEligible: r.itcEligible ? 'Yes' : 'No' })),
        totalsRow: {
          supplierName: 'TOTAL',
          taxableValue: sum(purchases.rows, (r) => r.taxableValue),
          cgst: sum(purchases.rows, (r) => r.cgst),
          sgst: sum(purchases.rows, (r) => r.sgst),
          igst: sum(purchases.rows, (r) => r.igst),
          total: sum(purchases.rows, (r) => r.total),
        },
      },
      {
        name: 'GSTR3B Summary',
        title: 'GSTR-3B · Summary',
        subtitle: period,
        columns: [
          { header: 'Particulars', key: 'particulars', width: 48 },
          { header: 'Taxable value', key: 'taxableValue', format: 'money' },
          { header: 'IGST', key: 'igst', format: 'money' },
          { header: 'CGST', key: 'cgst', format: 'money' },
          { header: 'SGST', key: 'sgst', format: 'money' },
        ],
        rows: [
          {
            particulars: '3.1(a) Outward taxable supplies (other than zero rated)',
            taxableValue: gstr3b.outward.taxableSupplies.taxableValue,
            igst: gstr3b.outward.taxableSupplies.igst,
            cgst: gstr3b.outward.taxableSupplies.cgst,
            sgst: gstr3b.outward.taxableSupplies.sgst,
          },
          {
            particulars: '4(A)(5) ITC available — all other ITC',
            taxableValue: 0,
            igst: gstr3b.inward.itcAvailable.igst,
            cgst: gstr3b.inward.itcAvailable.cgst,
            sgst: gstr3b.inward.itcAvailable.sgst,
          },
          {
            particulars: '4(D) Ineligible ITC',
            taxableValue: 0,
            igst: gstr3b.inward.itcIneligible,
            cgst: 0,
            sgst: 0,
          },
        ],
        totalsRow: {
          particulars: 'Net tax payable (before cross-utilisation)',
          taxableValue: 0,
          igst: gstr3b.netPayable.igst,
          cgst: gstr3b.netPayable.cgst,
          sgst: gstr3b.netPayable.sgst,
        },
        notes: [
          'Net payable is computed like-against-like (CGST credit against CGST, and so on).',
          'Cross-utilisation of IGST credit is left to the accountant — the order of set-off changes the cash outflow and is a judgement call, not arithmetic.',
        ],
      },
    ];
  }

  private async dayBookSheet(options: ExportOptions): Promise<SheetSpec> {
    const book = await dayBookService.list({ from: options.from, to: options.to, page: 1, limit: 10_000 });

    return {
      name: 'Day Book',
      title: 'Day Book — every voucher posted',
      subtitle: periodLabel(options.from, options.to),
      columns: [
        { header: 'Date', key: 'date', format: 'date' },
        { header: 'Voucher', key: 'voucherNumber', width: 20 },
        { header: 'Type', key: 'sourceType', width: 20 },
        { header: 'Party', key: 'partyName', width: 28 },
        { header: 'Narration', key: 'narration', width: 52 },
        { header: 'Amount', key: 'amount', format: 'money' },
        { header: 'Entered by', key: 'createdBy', width: 22 },
      ],
      rows: book.data.map((entry) => ({
        date: fmtDate(entry.entryDate),
        voucherNumber: entry.voucherNumber,
        sourceType: entry.sourceType,
        partyName: entry.partyName ?? '',
        narration: entry.narration,
        amount: entry.amount,
        createdBy: entry.createdBy,
      })),
      totalsRow: { narration: `${book.meta.total} vouchers`, amount: book.totals.amount },
    };
  }

  private async ageingSheets(options: ExportOptions): Promise<SheetSpec[]> {
    const asAt = options.to ?? new Date();
    const [receivables, payables] = await Promise.all([
      ageingService.receivables(asAt),
      ageingService.payables(asAt),
    ]);

    type AgeingReport = Awaited<ReturnType<typeof ageingService.receivables>>;

    const columns = (label: string) => [
      { header: label, key: 'partyName', width: 34 },
      { header: 'Total outstanding', key: 'total', format: 'money' as const },
      { header: '0-30 days', key: 'b0', format: 'money' as const },
      { header: '31-60 days', key: 'b1', format: 'money' as const },
      { header: '61-90 days', key: 'b2', format: 'money' as const },
      { header: '91-180 days', key: 'b3', format: 'money' as const },
      { header: 'Over 180 days', key: 'b4', format: 'money' as const },
      { header: 'Oldest (days)', key: 'oldestDays', format: 'number' as const },
    ];

    const mapRows = (report: AgeingReport) =>
      report.rows.map((row) => ({
        partyName: row.partyName,
        total: row.total,
        b0: row.buckets[0]?.amount ?? 0,
        b1: row.buckets[1]?.amount ?? 0,
        b2: row.buckets[2]?.amount ?? 0,
        b3: row.buckets[3]?.amount ?? 0,
        b4: row.buckets[4]?.amount ?? 0,
        oldestDays: row.oldestDays,
      }));

    const totalsRow = (report: AgeingReport) => ({
      partyName: 'TOTAL',
      total: report.totals.total,
      b0: report.totals.buckets[0]?.amount ?? 0,
      b1: report.totals.buckets[1]?.amount ?? 0,
      b2: report.totals.buckets[2]?.amount ?? 0,
      b3: report.totals.buckets[3]?.amount ?? 0,
      b4: report.totals.buckets[4]?.amount ?? 0,
      oldestDays: 0,
    });

    return [
      {
        name: 'Receivables Ageing',
        title: 'Receivables Ageing — money owed to the business',
        subtitle: `As at ${fmtDate(asAt)}`,
        columns: columns('Customer'),
        rows: mapRows(receivables),
        totalsRow: totalsRow(receivables),
      },
      {
        name: 'Payables Ageing',
        title: 'Payables Ageing — money the business owes',
        subtitle: `As at ${fmtDate(asAt)}`,
        columns: columns('Supplier'),
        rows: mapRows(payables),
        totalsRow: totalsRow(payables),
      },
    ];
  }

  /**
   * A flat, one-row-per-journal-line sheet. Tally and most other accounting packages import a
   * shape like this far more reliably than a formatted report, so this is the sheet to hand over
   * when the CA wants the data inside their own software rather than in Excel.
   */
  private async tallySheet(options: ExportOptions): Promise<SheetSpec> {
    const lines = await prisma.journalLine.findMany({
      where: {
        journalEntry: {
          status: 'POSTED',
          ...(options.from || options.to
            ? { entryDate: { ...(options.from && { gte: options.from }), ...(options.to && { lte: options.to }) } }
            : {}),
        },
      },
      orderBy: [{ journalEntry: { entryDate: 'asc' } }, { lineNumber: 'asc' }],
      include: {
        account: { select: { code: true, name: true } },
        journalEntry: {
          select: { voucherNumber: true, entryDate: true, narration: true, sourceType: true, partyName: true },
        },
      },
      take: 50_000,
    });

    return {
      name: 'Journal Export',
      title: 'Journal — flat export for import into accounting software',
      subtitle: periodLabel(options.from, options.to),
      columns: [
        { header: 'Voucher Date', key: 'date', format: 'date' },
        { header: 'Voucher Number', key: 'voucher', width: 20 },
        { header: 'Voucher Type', key: 'type', width: 20 },
        { header: 'Ledger Code', key: 'code', width: 12 },
        { header: 'Ledger Name', key: 'ledger', width: 36 },
        { header: 'Party', key: 'party', width: 28 },
        { header: 'Debit', key: 'debit', format: 'money' },
        { header: 'Credit', key: 'credit', format: 'money' },
        { header: 'Narration', key: 'narration', width: 52 },
      ],
      rows: lines.map((line) => ({
        date: fmtDate(line.journalEntry.entryDate),
        voucher: line.journalEntry.voucherNumber,
        type: line.journalEntry.sourceType,
        code: line.account.code,
        ledger: line.account.name,
        party: line.journalEntry.partyName ?? '',
        debit: Number(line.debit),
        credit: Number(line.credit),
        narration: line.description ?? line.journalEntry.narration,
      })),
      notes: ['One row per journal line. Every voucher number appears at least twice — once for each side of the entry.'],
    };
  }
}

export const financeExportService = new FinanceExportService();

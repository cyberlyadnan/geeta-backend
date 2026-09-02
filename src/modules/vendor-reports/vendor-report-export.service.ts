import { prisma } from '../../config/database.js';
import { WorkbookBuilder, type SheetSpec } from '../../services/accounting/index.js';
import { vendorReportsService } from './vendor-reports.service.js';
import type { VendorExportQuery } from './vendor-reports.validation.js';

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function periodLabel(from?: Date, to?: Date): string {
  return `${from ? fmtDate(from) : 'Beginning'} to ${to ? fmtDate(to) : fmtDate(new Date())}`;
}

/**
 * The vendor's own Excel exports.
 *
 * Reuses the accounting module's `WorkbookBuilder` rather than writing a second spreadsheet layer:
 * the vendor's accountant and the business's accountant should receive files that look and behave
 * identically — same Indian digit grouping, same frozen headers, same totals row — because they
 * are frequently the same person reconciling both sides of the relationship.
 *
 * `ca-pack` is the one that matters: purchases, invoices and the wallet statement in one workbook
 * for a quarter, which is exactly the bundle a CA asks a print vendor for at filing time.
 */
export class VendorReportExportService {
  async build(
    vendorUserId: string,
    query: VendorExportQuery,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const vendor = await prisma.user.findUnique({
      where: { id: vendorUserId },
      select: {
        firstName: true,
        lastName: true,
        vendorProfile: { select: { businessName: true, gstNumber: true, vendorCode: true } },
      },
    });

    const businessName =
      vendor?.vendorProfile?.businessName ?? `${vendor?.firstName ?? ''} ${vendor?.lastName ?? ''}`.trim();

    const builder = new WorkbookBuilder({
      companyName: businessName || 'Vendor',
      gstin: vendor?.vendorProfile?.gstNumber ?? null,
    });

    for (const sheet of await this.sheetsFor(vendorUserId, query)) {
      builder.addSheet(sheet);
    }

    const codePart = vendor?.vendorProfile?.vendorCode ?? 'vendor';
    return {
      buffer: await builder.toBuffer(),
      filename: `${codePart}-${query.pack}-${fmtDate(query.from) || 'all'}-to-${fmtDate(query.to) || fmtDate(new Date())}.xlsx`,
    };
  }

  private async sheetsFor(vendorUserId: string, query: VendorExportQuery): Promise<SheetSpec[]> {
    switch (query.pack) {
      case 'purchase-register':
        return [await this.purchaseSheet(vendorUserId, query)];
      case 'invoice-register':
        return [await this.invoiceSheet(vendorUserId, query)];
      case 'wallet-statement':
        return [await this.walletSheet(vendorUserId, query)];
      default:
        return [
          await this.summarySheet(vendorUserId, query),
          await this.purchaseSheet(vendorUserId, query),
          await this.invoiceSheet(vendorUserId, query),
          await this.walletSheet(vendorUserId, query),
        ];
    }
  }

  private async summarySheet(vendorUserId: string, query: VendorExportQuery): Promise<SheetSpec> {
    const summary = await vendorReportsService.summary(vendorUserId, {
      from: query.from,
      to: query.to,
      groupBy: 'month',
    });

    return {
      name: 'Summary',
      title: 'Purchase summary',
      subtitle: periodLabel(query.from, query.to),
      columns: [
        { header: 'Particulars', key: 'label', width: 44 },
        { header: 'Value', key: 'value', format: 'money', width: 18 },
      ],
      rows: [
        { label: 'Orders placed', value: summary.totals.orderCount },
        { label: 'Total purchase value', value: summary.totals.totalSpend },
        { label: 'GST paid on purchases', value: summary.totals.taxPaid },
        { label: 'Average order value', value: summary.totals.averageOrderValue },
        { label: 'Invoices received', value: summary.totals.invoiceCount },
        { label: 'Invoiced total', value: summary.totals.invoicedTotal },
        { label: 'GST on invoices', value: summary.totals.gstOnInvoices },
        { label: 'Wallet balance (today)', value: summary.totals.walletBalance },
        { label: 'Free reprints received', value: summary.totals.reprintCount },
      ],
      notes: [
        'Month-by-month spend follows below.',
        'Reprints are replacement jobs supplied at no charge and carry no purchase value.',
      ],
      freezeHeader: false,
    };
  }

  private async purchaseSheet(vendorUserId: string, query: VendorExportQuery): Promise<SheetSpec> {
    const report = await vendorReportsService.purchaseReport(vendorUserId, {
      from: query.from,
      to: query.to,
      includeReprints: query.includeReprints,
      sort: 'oldest',
      page: 1,
      limit: 200,
    });

    // The register must contain the whole period, not the first page of it: an accountant filing a
    // return cannot work from a paginated view.
    const allRows = [...report.data];
    let page = 2;
    while (allRows.length < report.meta.total && page <= 100) {
      const next = await vendorReportsService.purchaseReport(vendorUserId, {
        from: query.from,
        to: query.to,
        includeReprints: query.includeReprints,
        sort: 'oldest',
        page,
        limit: 200,
      });
      if (next.data.length === 0) break;
      allRows.push(...next.data);
      page += 1;
    }

    return {
      name: 'Purchase Register',
      title: 'Purchase register',
      subtitle: periodLabel(query.from, query.to),
      columns: [
        { header: 'Date', key: 'orderDate', format: 'date' },
        { header: 'Order number', key: 'orderNumber', width: 20 },
        { header: 'Job name', key: 'orderName', width: 28 },
        { header: 'Product', key: 'productName', width: 28 },
        { header: 'HSN', key: 'hsnCode', width: 10 },
        { header: 'Qty', key: 'quantity', format: 'number' },
        { header: 'Taxable value', key: 'subtotal', format: 'money' },
        { header: 'Delivery', key: 'deliveryCharge', format: 'money' },
        { header: 'CGST', key: 'cgstAmount', format: 'money' },
        { header: 'SGST', key: 'sgstAmount', format: 'money' },
        { header: 'IGST', key: 'igstAmount', format: 'money' },
        { header: 'GST total', key: 'taxAmount', format: 'money' },
        { header: 'Total', key: 'totalAmount', format: 'money' },
        { header: 'Invoice number', key: 'invoiceNumber', width: 20 },
        { header: 'Status', key: 'status', width: 18 },
        { header: 'Reprint', key: 'reprintLabel', width: 12 },
      ],
      rows: allRows.map((row) => ({
        ...row,
        orderDate: fmtDate(row.orderDate),
        reprintLabel: row.isReprint ? `of ${row.reprintOfOrderNumber ?? ''}` : '',
      })),
      totalsRow: {
        orderName: `${String(allRows.length)} orders`,
        subtotal: report.totals.subtotal,
        deliveryCharge: report.totals.deliveryCharge,
        taxAmount: report.totals.taxAmount,
        totalAmount: report.totals.totalAmount,
      },
      notes: [
        'Every figure here matches the supplier’s own books — both are read from the same records.',
      ],
    };
  }

  private async invoiceSheet(vendorUserId: string, query: VendorExportQuery): Promise<SheetSpec> {
    const report = await vendorReportsService.invoices(vendorUserId, {
      from: query.from,
      to: query.to,
      page: 1,
      limit: 200,
    });

    const allRows = [...report.data];
    let page = 2;
    while (allRows.length < report.meta.total && page <= 100) {
      const next = await vendorReportsService.invoices(vendorUserId, {
        from: query.from,
        to: query.to,
        page,
        limit: 200,
      });
      if (next.data.length === 0) break;
      allRows.push(...next.data);
      page += 1;
    }

    return {
      name: 'Invoice Register',
      title: 'Invoices received — for GSTR-2B reconciliation',
      subtitle: periodLabel(query.from, query.to),
      columns: [
        { header: 'Invoice date', key: 'invoiceDate', format: 'date' },
        { header: 'Invoice number', key: 'invoiceNumber', width: 22 },
        { header: 'Supplier GSTIN', key: 'supplierGstin', width: 20 },
        { header: 'Your GSTIN', key: 'gstNumber', width: 20 },
        { header: 'Place of supply', key: 'placeOfSupply', width: 16 },
        { header: 'Orders covered', key: 'orderNumbers', width: 30 },
        { header: 'Taxable value', key: 'taxableValue', format: 'money' },
        { header: 'Rate', key: 'gstRate', format: 'percent' },
        { header: 'CGST', key: 'cgstAmount', format: 'money' },
        { header: 'SGST', key: 'sgstAmount', format: 'money' },
        { header: 'IGST', key: 'igstAmount', format: 'money' },
        { header: 'Invoice total', key: 'total', format: 'money' },
      ],
      rows: allRows.map((row) => ({
        ...row,
        invoiceDate: fmtDate(row.invoiceDate),
        supplierGstin: '',
        taxableValue: row.subtotal + row.deliveryCharge,
        orderNumbers: row.orders.map((order) => order.orderNumber).join(', '),
      })),
      totalsRow: {
        invoiceNumber: `${String(allRows.length)} invoices`,
        taxableValue: report.totals.taxableValue,
        total: report.totals.total,
      },
      notes: [
        'One invoice can cover several orders — the orders it covers are listed in each row.',
        'Match these against your GSTR-2B to claim input credit on your printing purchases.',
      ],
    };
  }

  private async walletSheet(vendorUserId: string, query: VendorExportQuery): Promise<SheetSpec> {
    const report = await vendorReportsService.walletStatement(vendorUserId, {
      from: query.from,
      to: query.to,
      page: 1,
      limit: 200,
    });

    const allRows = [...report.data];
    let page = 2;
    while (allRows.length < report.meta.total && page <= 100) {
      const next = await vendorReportsService.walletStatement(vendorUserId, {
        from: query.from,
        to: query.to,
        page,
        limit: 200,
      });
      if (next.data.length === 0) break;
      allRows.push(...next.data);
      page += 1;
    }

    return {
      name: 'Wallet Statement',
      title: 'Wallet statement',
      subtitle: periodLabel(query.from, query.to),
      columns: [
        { header: 'Date', key: 'date', format: 'date' },
        { header: 'Type', key: 'type', width: 20 },
        { header: 'Order', key: 'orderNumber', width: 20 },
        { header: 'Particulars', key: 'description', width: 40 },
        { header: 'Reference', key: 'reference', width: 24 },
        { header: 'Amount', key: 'amount', format: 'money' },
        { header: 'Balance after', key: 'balanceAfter', format: 'money' },
      ],
      // Oldest first: a statement reads forwards, and the running balance only makes sense that way.
      rows: [...allRows].reverse().map((row) => ({ ...row, date: fmtDate(row.date) })),
      totalsRow: {
        description: 'Closing balance',
        balanceAfter: report.totals.currentBalance,
      },
      notes: [
        `Money added in this period: ₹${report.totals.credited.toFixed(2)} · spent: ₹${report.totals.debited.toFixed(2)}`,
      ],
    };
  }
}

export const vendorReportExportService = new VendorReportExportService();

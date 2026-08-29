import { CreditNoteStatus, GstDocumentCategory, GstSupplyType, type Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { financeSettingsService } from '../finance-settings.service.js';
import { stateNameFromCode } from '../india-states.js';
import { normaliseRange, round2 } from './report.types.js';

export interface Gstr1Row {
  gstin: string | null;
  receiverName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  placeOfSupply: string;
  placeOfSupplyName: string | null;
  reverseCharge: 'Y' | 'N';
  invoiceType: string;
  rate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

export interface Gstr1Report {
  range: { from: string; to: string };
  b2b: Gstr1Row[];
  b2cl: Gstr1Row[];
  b2cs: {
    placeOfSupply: string;
    placeOfSupplyName: string | null;
    rate: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
  }[];
  creditNotes: (Gstr1Row & { originalInvoiceNumber: string | null; noteReason: string })[];
  hsnSummary: {
    hsnCode: string;
    description: string;
    uom: string;
    quantity: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }[];
  documentSummary: { invoiceCount: number; creditNoteCount: number; firstNumber: string | null; lastNumber: string | null };
  totals: { taxableValue: number; cgst: number; sgst: number; igst: number; cess: number; invoiceValue: number };
}

export interface Gstr3bReport {
  range: { from: string; to: string };
  outward: {
    taxableSupplies: { taxableValue: number; igst: number; cgst: number; sgst: number; cess: number };
    nilRatedExempt: number;
  };
  inward: {
    /** Input tax credit available on purchases and expenses in the period. */
    itcAvailable: { igst: number; cgst: number; sgst: number; cess: number };
    itcIneligible: number;
  };
  netPayable: { igst: number; cgst: number; sgst: number; cess: number; total: number };
}

/**
 * GST returns, in the shape the portal and the CA expect.
 *
 * The value of this report is that it is derived from issued documents — invoices and credit notes
 * with their own numbers, dates and HSN lines — rather than from summed ledger balances. That is
 * what makes it *filable*: GSTR-1 is a document-level return, and a total that cannot be broken
 * back down into the invoices behind it will not survive a scrutiny notice.
 */
export class GstReturnsService {
  async gstr1(options: { from?: Date; to?: Date }): Promise<Gstr1Report> {
    const range = normaliseRange(options.from, options.to);
    const where: Prisma.InvoiceWhereInput = { createdAt: { gte: range.from, lte: range.to } };

    const [invoices, creditNotes] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { invoiceNumber: 'asc' },
        include: { taxLines: { orderBy: { lineNumber: 'asc' } } },
      }),
      prisma.creditNote.findMany({
        where: { noteDate: { gte: range.from, lte: range.to }, status: CreditNoteStatus.ISSUED },
        orderBy: { creditNoteNumber: 'asc' },
        include: { invoice: { select: { invoiceNumber: true } } },
      }),
    ]);

    const b2b: Gstr1Row[] = [];
    const b2cl: Gstr1Row[] = [];
    const b2csMap = new Map<string, Gstr1Report['b2cs'][number]>();
    const hsnMap = new Map<string, Gstr1Report['hsnSummary'][number]>();

    for (const invoice of invoices) {
      const rate = round2(Number(invoice.gstRate) * 100);
      const taxable = round2(Number(invoice.subtotal) + Number(invoice.deliveryCharge));
      const row: Gstr1Row = {
        gstin: invoice.gstNumber,
        receiverName: invoice.billedToName,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.createdAt.toISOString().slice(0, 10),
        invoiceValue: round2(Number(invoice.total)),
        placeOfSupply: invoice.placeOfSupply ?? '',
        placeOfSupplyName: stateNameFromCode(invoice.placeOfSupply),
        reverseCharge: invoice.reverseCharge ? 'Y' : 'N',
        invoiceType: 'Regular B2B',
        rate,
        taxableValue: taxable,
        cgst: round2(Number(invoice.cgstAmount)),
        sgst: round2(Number(invoice.sgstAmount)),
        igst: round2(Number(invoice.igstAmount)),
        cess: round2(Number(invoice.cessAmount)),
      };

      switch (invoice.documentCategory) {
        case GstDocumentCategory.B2B:
          b2b.push(row);
          break;
        case GstDocumentCategory.B2CL:
          b2cl.push({ ...row, invoiceType: 'B2C Large' });
          break;
        default: {
          // B2C small is reported as a rate-wise, state-wise consolidation — never per invoice.
          const key = `${invoice.placeOfSupply ?? ''}:${String(rate)}`;
          const bucket =
            b2csMap.get(key) ??
            {
              placeOfSupply: invoice.placeOfSupply ?? '',
              placeOfSupplyName: stateNameFromCode(invoice.placeOfSupply),
              rate,
              taxableValue: 0,
              cgst: 0,
              sgst: 0,
              igst: 0,
              cess: 0,
            };
          bucket.taxableValue = round2(bucket.taxableValue + taxable);
          bucket.cgst = round2(bucket.cgst + Number(invoice.cgstAmount));
          bucket.sgst = round2(bucket.sgst + Number(invoice.sgstAmount));
          bucket.igst = round2(bucket.igst + Number(invoice.igstAmount));
          bucket.cess = round2(bucket.cess + Number(invoice.cessAmount));
          b2csMap.set(key, bucket);
        }
      }

      for (const line of invoice.taxLines) {
        const key = `${line.hsnCode}:${String(Number(line.gstRate))}`;
        const bucket =
          hsnMap.get(key) ??
          {
            hsnCode: line.hsnCode,
            description: line.description,
            uom: line.uom,
            quantity: 0,
            taxableValue: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            total: 0,
          };
        bucket.quantity = round2(bucket.quantity + Number(line.quantity));
        bucket.taxableValue = round2(bucket.taxableValue + Number(line.taxableValue));
        bucket.cgst = round2(bucket.cgst + Number(line.cgstAmount));
        bucket.sgst = round2(bucket.sgst + Number(line.sgstAmount));
        bucket.igst = round2(bucket.igst + Number(line.igstAmount));
        bucket.total = round2(bucket.total + Number(line.total));
        hsnMap.set(key, bucket);
      }
    }

    const creditNoteRows = creditNotes.map((note) => ({
      gstin: note.gstNumber,
      receiverName: note.billedToName,
      invoiceNumber: note.creditNoteNumber,
      invoiceDate: note.noteDate.toISOString().slice(0, 10),
      invoiceValue: round2(Number(note.total)),
      placeOfSupply: note.placeOfSupply ?? '',
      placeOfSupplyName: stateNameFromCode(note.placeOfSupply),
      reverseCharge: 'N' as const,
      invoiceType: note.documentCategory === GstDocumentCategory.CREDIT_NOTE_B2B ? 'B2B Credit Note' : 'B2C Credit Note',
      rate: round2(Number(note.gstRate)),
      taxableValue: round2(Number(note.taxableValue)),
      cgst: round2(Number(note.cgstAmount)),
      sgst: round2(Number(note.sgstAmount)),
      igst: round2(Number(note.igstAmount)),
      cess: 0,
      originalInvoiceNumber: note.invoice?.invoiceNumber ?? null,
      noteReason: note.reason,
    }));

    const allRows = [...b2b, ...b2cl];
    const totals = {
      taxableValue: round2(
        allRows.reduce((s, r) => s + r.taxableValue, 0) +
          [...b2csMap.values()].reduce((s, r) => s + r.taxableValue, 0),
      ),
      cgst: round2(
        allRows.reduce((s, r) => s + r.cgst, 0) + [...b2csMap.values()].reduce((s, r) => s + r.cgst, 0),
      ),
      sgst: round2(
        allRows.reduce((s, r) => s + r.sgst, 0) + [...b2csMap.values()].reduce((s, r) => s + r.sgst, 0),
      ),
      igst: round2(
        allRows.reduce((s, r) => s + r.igst, 0) + [...b2csMap.values()].reduce((s, r) => s + r.igst, 0),
      ),
      cess: round2(
        allRows.reduce((s, r) => s + r.cess, 0) + [...b2csMap.values()].reduce((s, r) => s + r.cess, 0),
      ),
      invoiceValue: round2(invoices.reduce((s, i) => s + Number(i.total), 0)),
    };

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      b2b,
      b2cl,
      b2cs: [...b2csMap.values()],
      creditNotes: creditNoteRows,
      hsnSummary: [...hsnMap.values()].sort((a, b) => a.hsnCode.localeCompare(b.hsnCode)),
      documentSummary: {
        invoiceCount: invoices.length,
        creditNoteCount: creditNotes.length,
        firstNumber: invoices[0]?.invoiceNumber ?? null,
        lastNumber: invoices[invoices.length - 1]?.invoiceNumber ?? null,
      },
      totals,
    };
  }

  /**
   * GSTR-3B: the monthly summary return and, in practice, the number the business actually pays.
   * Output tax comes from issued invoices net of credit notes; input tax from purchase bills and
   * expenses flagged as credit-eligible.
   */
  async gstr3b(options: { from?: Date; to?: Date }): Promise<Gstr3bReport> {
    const range = normaliseRange(options.from, options.to);
    const dateFilter = { gte: range.from, lte: range.to };

    const [invoiceAgg, creditNoteAgg, billAgg, expenseAgg, ineligibleBills, ineligibleExpenses] =
      await Promise.all([
        prisma.invoice.aggregate({
          where: { createdAt: dateFilter },
          _sum: { subtotal: true, deliveryCharge: true, cgstAmount: true, sgstAmount: true, igstAmount: true, cessAmount: true },
        }),
        prisma.creditNote.aggregate({
          where: { noteDate: dateFilter, status: CreditNoteStatus.ISSUED },
          _sum: { taxableValue: true, cgstAmount: true, sgstAmount: true, igstAmount: true },
        }),
        prisma.purchaseBill.aggregate({
          where: { billDate: dateFilter, inputCreditEligible: true, status: { not: 'CANCELLED' } },
          _sum: { cgstAmount: true, sgstAmount: true, igstAmount: true },
        }),
        prisma.expense.aggregate({
          where: { expenseDate: dateFilter, inputCreditEligible: true, status: { in: ['APPROVED', 'PAID'] } },
          _sum: { cgstAmount: true, sgstAmount: true, igstAmount: true },
        }),
        prisma.purchaseBill.aggregate({
          where: { billDate: dateFilter, inputCreditEligible: false, status: { not: 'CANCELLED' } },
          _sum: { cgstAmount: true, sgstAmount: true, igstAmount: true },
        }),
        prisma.expense.aggregate({
          where: { expenseDate: dateFilter, inputCreditEligible: false, status: { in: ['APPROVED', 'PAID'] } },
          _sum: { cgstAmount: true, sgstAmount: true, igstAmount: true },
        }),
      ]);

    const n = (v: Prisma.Decimal | null | undefined) => round2(Number(v ?? 0));

    const outwardTaxable = round2(
      n(invoiceAgg._sum.subtotal) + n(invoiceAgg._sum.deliveryCharge) - n(creditNoteAgg._sum.taxableValue),
    );
    const outCgst = round2(n(invoiceAgg._sum.cgstAmount) - n(creditNoteAgg._sum.cgstAmount));
    const outSgst = round2(n(invoiceAgg._sum.sgstAmount) - n(creditNoteAgg._sum.sgstAmount));
    const outIgst = round2(n(invoiceAgg._sum.igstAmount) - n(creditNoteAgg._sum.igstAmount));
    const outCess = n(invoiceAgg._sum.cessAmount);

    const itcCgst = round2(n(billAgg._sum.cgstAmount) + n(expenseAgg._sum.cgstAmount));
    const itcSgst = round2(n(billAgg._sum.sgstAmount) + n(expenseAgg._sum.sgstAmount));
    const itcIgst = round2(n(billAgg._sum.igstAmount) + n(expenseAgg._sum.igstAmount));

    const ineligible = round2(
      n(ineligibleBills._sum.cgstAmount) + n(ineligibleBills._sum.sgstAmount) + n(ineligibleBills._sum.igstAmount) +
        n(ineligibleExpenses._sum.cgstAmount) + n(ineligibleExpenses._sum.sgstAmount) + n(ineligibleExpenses._sum.igstAmount),
    );

    // Simplified set-off: like against like. Cross-utilisation (IGST credit against CGST/SGST)
    // is deliberately left to the CA — the order of set-off is a judgement call with cash-flow
    // consequences, and guessing it here would produce a confidently wrong number.
    const netCgst = round2(Math.max(0, outCgst - itcCgst));
    const netSgst = round2(Math.max(0, outSgst - itcSgst));
    const netIgst = round2(Math.max(0, outIgst - itcIgst));

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      outward: {
        taxableSupplies: {
          taxableValue: outwardTaxable,
          igst: outIgst,
          cgst: outCgst,
          sgst: outSgst,
          cess: outCess,
        },
        nilRatedExempt: 0,
      },
      inward: {
        itcAvailable: { igst: itcIgst, cgst: itcCgst, sgst: itcSgst, cess: 0 },
        itcIneligible: ineligible,
      },
      netPayable: {
        igst: netIgst,
        cgst: netCgst,
        sgst: netSgst,
        cess: outCess,
        total: round2(netIgst + netCgst + netSgst + outCess),
      },
    };
  }

  /** Purchase register — the rows a CA reconciles against GSTR-2B. */
  async purchaseRegister(options: { from?: Date; to?: Date }) {
    const range = normaliseRange(options.from, options.to);
    const settings = await financeSettingsService.get();

    const [bills, expenses] = await Promise.all([
      prisma.purchaseBill.findMany({
        where: { billDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
        orderBy: { billDate: 'asc' },
        include: { supplier: { select: { name: true, gstin: true, stateCode: true } } },
      }),
      prisma.expense.findMany({
        where: {
          expenseDate: { gte: range.from, lte: range.to },
          status: { in: ['APPROVED', 'PAID'] },
          OR: [{ cgstAmount: { gt: 0 } }, { igstAmount: { gt: 0 } }],
        },
        orderBy: { expenseDate: 'asc' },
        include: { supplier: { select: { name: true, gstin: true } }, category: { select: { name: true } } },
      }),
    ]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      homeStateCode: settings.homeStateCode,
      rows: [
        ...bills.map((bill) => ({
          kind: 'PURCHASE_BILL' as const,
          date: bill.billDate.toISOString().slice(0, 10),
          documentNumber: bill.supplierBillNumber,
          internalNumber: bill.billNumber,
          supplierName: bill.supplier.name,
          supplierGstin: bill.supplier.gstin,
          placeOfSupply: bill.placeOfSupply ?? bill.supplier.stateCode,
          supplyType: bill.supplyType,
          taxableValue: round2(Number(bill.taxableValue)),
          cgst: round2(Number(bill.cgstAmount)),
          sgst: round2(Number(bill.sgstAmount)),
          igst: round2(Number(bill.igstAmount)),
          total: round2(Number(bill.total)),
          itcEligible: bill.inputCreditEligible,
          description: 'Purchase',
        })),
        ...expenses.map((expense) => ({
          kind: 'EXPENSE' as const,
          date: expense.expenseDate.toISOString().slice(0, 10),
          documentNumber: expense.supplierInvoiceNumber ?? expense.expenseNumber,
          internalNumber: expense.expenseNumber,
          supplierName: expense.supplier?.name ?? expense.payeeName ?? 'Unregistered',
          supplierGstin: expense.supplierGstin ?? expense.supplier?.gstin ?? null,
          placeOfSupply: null,
          supplyType: GstSupplyType.INTRA_STATE,
          taxableValue: round2(Number(expense.taxableAmount)),
          cgst: round2(Number(expense.cgstAmount)),
          sgst: round2(Number(expense.sgstAmount)),
          igst: round2(Number(expense.igstAmount)),
          total: round2(Number(expense.totalAmount)),
          itcEligible: expense.inputCreditEligible,
          description: expense.category.name,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
}

export const gstReturnsService = new GstReturnsService();

import { Prisma, PurchaseBillStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  ACCOUNT_CODES,
  allocateVoucherNumber,
  fiscalService,
  gstService,
  syncAccountingFor,
  VOUCHER_SERIES,
} from '../../services/accounting/index.js';
import type {
  BillListQuery,
  CreatePurchaseBillInput,
  CreateSupplierInput,
  CreateSupplierPaymentInput,
  PaymentListQuery,
  PurchaseBillItemInput,
  SupplierListQuery,
  UpdateSupplierInput,
} from './purchases.validation.js';

const n = (value: Prisma.Decimal | number | null | undefined): number =>
  value == null ? 0 : typeof value === 'number' ? value : value.toNumber();
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Suppliers, their bills, and the payments that settle them.
 *
 * The design point is that a bill and its payment are separate events. A business that records
 * only payments has no idea what it owes; a business that records only bills has no idea what it
 * has actually spent. Keeping both, and linking them through explicit allocations, is what makes
 * "who do we owe, and since when" answerable — which is the question that decides whether the
 * paper supplier keeps extending credit.
 */
export class PurchasesService {
  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(query: SupplierListQuery) {
    const where: Prisma.SupplierWhereInput = {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { code: { contains: query.search, mode: 'insensitive' as const } },
          { gstin: { contains: query.search, mode: 'insensitive' as const } },
          { phone: { contains: query.search } },
        ],
      }),
    };

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { _count: { select: { bills: true } } },
      }),
      prisma.supplier.count({ where }),
    ]);

    const outstanding = await this.outstandingBySupplier(suppliers.map((s) => s.id));

    return {
      data: suppliers.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        contactPerson: s.contactPerson,
        phone: s.phone,
        email: s.email,
        gstin: s.gstin,
        pan: s.pan,
        city: s.city,
        state: s.state,
        stateCode: s.stateCode,
        paymentTermsDays: s.paymentTermsDays,
        isActive: s.isActive,
        billCount: s._count.bills,
        outstanding: outstanding.get(s.id) ?? 0,
      })),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  async createSupplier(input: CreateSupplierInput, userId: string) {
    const code = await this.nextSupplierCode();
    return prisma.supplier.create({
      data: {
        code,
        name: input.name,
        contactPerson: input.contactPerson ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        gstin: input.gstin?.toUpperCase() ?? null,
        pan: input.pan?.toUpperCase() ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        // Derive the state code from the GSTIN when the user did not type one — its first two
        // digits are the state, and getting this right is what decides IGST vs CGST/SGST.
        stateCode: input.stateCode ?? (input.gstin ? input.gstin.trim().slice(0, 2) : null),
        pincode: input.pincode ?? null,
        paymentTermsDays: input.paymentTermsDays,
        openingBalance: new Prisma.Decimal(input.openingBalance),
        notes: input.notes ?? null,
        createdById: userId,
      },
    });
  }

  async updateSupplier(id: string, input: UpdateSupplierInput) {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw ApiError.notFound('Supplier not found');
    return prisma.supplier.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.contactPerson !== undefined && { contactPerson: input.contactPerson }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.gstin !== undefined && { gstin: input.gstin.toUpperCase() }),
        ...(input.pan !== undefined && { pan: input.pan.toUpperCase() }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.city !== undefined && { city: input.city }),
        ...(input.state !== undefined && { state: input.state }),
        ...(input.stateCode !== undefined && { stateCode: input.stateCode }),
        ...(input.pincode !== undefined && { pincode: input.pincode }),
        ...(input.paymentTermsDays !== undefined && { paymentTermsDays: input.paymentTermsDays }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  }

  async getSupplier(id: string) {
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        bills: { orderBy: { billDate: 'desc' }, take: 20 },
        payments: { orderBy: { paymentDate: 'desc' }, take: 20 },
      },
    });
    if (!supplier) throw ApiError.notFound('Supplier not found');
    const outstanding = (await this.outstandingBySupplier([id])).get(id) ?? 0;
    return { ...supplier, outstanding };
  }

  // ── Bills ─────────────────────────────────────────────────────────────────

  async listBills(query: BillListQuery) {
    const where: Prisma.PurchaseBillWhereInput = {
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...(query.status && { status: query.status }),
      ...(query.outstandingOnly && {
        status: { in: [PurchaseBillStatus.APPROVED, PurchaseBillStatus.PARTIALLY_PAID] },
      }),
      ...((query.from || query.to) && {
        billDate: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...(query.search && {
        OR: [
          { billNumber: { contains: query.search, mode: 'insensitive' as const } },
          { supplierBillNumber: { contains: query.search, mode: 'insensitive' as const } },
          { supplier: { name: { contains: query.search, mode: 'insensitive' as const } } },
        ],
      }),
    };

    const [bills, total, agg] = await Promise.all([
      prisma.purchaseBill.findMany({
        where,
        include: { supplier: { select: { id: true, name: true, gstin: true } } },
        orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.purchaseBill.count({ where }),
      prisma.purchaseBill.aggregate({ where, _sum: { taxableValue: true, total: true, amountPaid: true } }),
    ]);

    return {
      data: bills.map((bill) => ({
        id: bill.id,
        billNumber: bill.billNumber,
        supplierBillNumber: bill.supplierBillNumber,
        supplierId: bill.supplierId,
        supplierName: bill.supplier.name,
        supplierGstin: bill.supplier.gstin,
        billDate: bill.billDate.toISOString(),
        dueDate: bill.dueDate.toISOString(),
        taxableValue: n(bill.taxableValue),
        gstAmount: round2(n(bill.cgstAmount) + n(bill.sgstAmount) + n(bill.igstAmount)),
        total: n(bill.total),
        amountPaid: n(bill.amountPaid),
        outstanding: round2(n(bill.total) - n(bill.amountPaid)),
        status: bill.status,
        overdueDays:
          bill.status === PurchaseBillStatus.PAID || bill.status === PurchaseBillStatus.CANCELLED
            ? 0
            : Math.max(0, Math.floor((Date.now() - bill.dueDate.getTime()) / 86_400_000)),
      })),
      totals: {
        taxableValue: n(agg._sum.taxableValue),
        total: n(agg._sum.total),
        paid: n(agg._sum.amountPaid),
        outstanding: round2(n(agg._sum.total) - n(agg._sum.amountPaid)),
      },
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  async getBill(id: string) {
    const bill = await prisma.purchaseBill.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: { orderBy: { lineNumber: 'asc' } },
        allocations: { include: { payment: { select: { paymentNumber: true, paymentDate: true, mode: true } } } },
      },
    });
    if (!bill) throw ApiError.notFound('Purchase bill not found');
    return bill;
  }

  async createBill(input: CreatePurchaseBillInput, userId: string) {
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier?.isActive) throw ApiError.badRequest('Choose an active supplier');

    const placeOfSupply = input.placeOfSupplyStateCode ?? supplier.stateCode ?? undefined;
    const computed = await this.computeBillTotals(input.items, input.discount, placeOfSupply);

    const dueDate =
      input.dueDate ??
      new Date(input.billDate.getTime() + supplier.paymentTermsDays * 86_400_000);

    const { fiscalYear } = await fiscalService.coordinatesFor(input.billDate);

    const bill = await prisma.$transaction(async (tx) => {
      const billNumber = await allocateVoucherNumber(tx, VOUCHER_SERIES.PURCHASE, fiscalYear);
      const total = round2(computed.total + input.roundOff);

      return tx.purchaseBill.create({
        data: {
          billNumber,
          supplierBillNumber: input.supplierBillNumber,
          supplierId: input.supplierId,
          billDate: input.billDate,
          dueDate,
          placeOfSupply: placeOfSupply ?? null,
          supplyType: computed.supplyType,
          subtotal: new Prisma.Decimal(computed.subtotal),
          discount: new Prisma.Decimal(input.discount),
          taxableValue: new Prisma.Decimal(computed.taxableValue),
          cgstAmount: new Prisma.Decimal(computed.cgst),
          sgstAmount: new Prisma.Decimal(computed.sgst),
          igstAmount: new Prisma.Decimal(computed.igst),
          roundOff: new Prisma.Decimal(input.roundOff),
          total: new Prisma.Decimal(total),
          status: PurchaseBillStatus.APPROVED,
          inputCreditEligible: input.inputCreditEligible,
          reverseCharge: input.reverseCharge,
          attachmentUrl: input.attachmentUrl ?? null,
          notes: input.notes ?? null,
          createdById: userId,
          items: { create: computed.items },
        },
        include: { supplier: true, items: true },
      });
    });

    syncAccountingFor('purchase-bills', userId);
    return bill;
  }

  async cancelBill(id: string, reason: string, userId: string) {
    const bill = await prisma.purchaseBill.findUnique({ where: { id } });
    if (!bill) throw ApiError.notFound('Purchase bill not found');
    if (n(bill.amountPaid) > 0) {
      throw ApiError.badRequest('This bill has payments against it. Reverse the payments first.');
    }

    const updated = await prisma.purchaseBill.update({
      where: { id },
      data: { status: PurchaseBillStatus.CANCELLED, notes: `${bill.notes ?? ''}\nCancelled: ${reason}`.trim() },
    });

    // If it already reached the ledger, reverse it there rather than deleting the entry.
    const entry = await prisma.journalEntry.findFirst({
      where: { sourceType: 'PURCHASE_BILL', sourceId: id, status: 'POSTED' },
    });
    if (entry) {
      const { postingService } = await import('../../services/accounting/index.js');
      await postingService.reverse(entry.id, { reason: `Bill cancelled: ${reason}`, userId });
    }

    return updated;
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  async listPayments(query: PaymentListQuery) {
    const where: Prisma.SupplierPaymentWhereInput = {
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...((query.from || query.to) && {
        paymentDate: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
    };

    const [payments, total, agg] = await Promise.all([
      prisma.supplierPayment.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          fromAccount: { select: { name: true } },
          allocations: { include: { bill: { select: { billNumber: true, supplierBillNumber: true } } } },
        },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.supplierPayment.count({ where }),
      prisma.supplierPayment.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      data: payments.map((p) => ({
        id: p.id,
        paymentNumber: p.paymentNumber,
        supplierId: p.supplierId,
        supplierName: p.supplier.name,
        paymentDate: p.paymentDate.toISOString(),
        amount: n(p.amount),
        tdsAmount: n(p.tdsAmount),
        mode: p.mode,
        fromAccountName: p.fromAccount.name,
        referenceNumber: p.referenceNumber,
        notes: p.notes,
        allocations: p.allocations.map((a) => ({
          billId: a.billId,
          billNumber: a.bill.billNumber,
          supplierBillNumber: a.bill.supplierBillNumber,
          amount: n(a.amount),
        })),
      })),
      totals: { amount: n(agg._sum.amount) },
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  /**
   * Records a payment and applies it to bills.
   *
   * The allocation is validated inside the transaction — over-allocating a bill or allocating more
   * than the payment is worth silently corrupts payables, and the failure mode is invisible until
   * a supplier disagrees about a balance months later.
   */
  async createPayment(input: CreateSupplierPaymentInput, userId: string) {
    const allocatedTotal = round2(input.allocations.reduce((s, a) => s + a.amount, 0));
    if (allocatedTotal > round2(input.amount + input.tdsAmount) + 0.01) {
      throw ApiError.badRequest('Allocations exceed the payment amount');
    }

    const { fiscalYear } = await fiscalService.coordinatesFor(input.paymentDate);

    const payment = await prisma.$transaction(async (tx) => {
      const bills = input.allocations.length
        ? await tx.purchaseBill.findMany({ where: { id: { in: input.allocations.map((a) => a.billId) } } })
        : [];
      const billById = new Map(bills.map((b) => [b.id, b]));

      for (const allocation of input.allocations) {
        const bill = billById.get(allocation.billId);
        if (!bill) throw ApiError.badRequest('One of the selected bills no longer exists');
        if (bill.supplierId !== input.supplierId) {
          throw ApiError.badRequest('A payment can only be applied to bills of the same supplier');
        }
        const outstanding = round2(n(bill.total) - n(bill.amountPaid));
        if (allocation.amount > outstanding + 0.01) {
          throw ApiError.badRequest(
            `Bill ${bill.supplierBillNumber} only has ${outstanding.toFixed(2)} outstanding`,
          );
        }
      }

      const paymentNumber = await allocateVoucherNumber(tx, VOUCHER_SERIES.PAYMENT, fiscalYear);
      const created = await tx.supplierPayment.create({
        data: {
          paymentNumber,
          supplierId: input.supplierId,
          paymentDate: input.paymentDate,
          amount: new Prisma.Decimal(input.amount),
          mode: input.mode,
          fromAccountId: input.fromAccountId,
          referenceNumber: input.referenceNumber ?? null,
          tdsAmount: new Prisma.Decimal(input.tdsAmount),
          notes: input.notes ?? null,
          createdById: userId,
          allocations: {
            create: input.allocations.map((a) => ({ billId: a.billId, amount: new Prisma.Decimal(a.amount) })),
          },
        },
        include: { allocations: true },
      });

      for (const allocation of input.allocations) {
        const bill = billById.get(allocation.billId)!;
        const newPaid = round2(n(bill.amountPaid) + allocation.amount);
        await tx.purchaseBill.update({
          where: { id: bill.id },
          data: {
            amountPaid: new Prisma.Decimal(newPaid),
            status:
              newPaid >= n(bill.total) - 0.01 ? PurchaseBillStatus.PAID : PurchaseBillStatus.PARTIALLY_PAID,
          },
        });
      }

      return created;
    });

    syncAccountingFor('supplier-payments', userId);
    return payment;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async computeBillTotals(
    items: PurchaseBillItemInput[],
    billDiscount: number,
    placeOfSupply?: string,
  ) {
    const accountCodes = [...new Set(items.map((i) => i.expenseAccountCode).filter(Boolean))] as string[];
    const accounts = accountCodes.length
      ? await prisma.chartOfAccount.findMany({ where: { code: { in: accountCodes } }, select: { id: true, code: true } })
      : [];
    const idByCode = new Map(accounts.map((a) => [a.code, a.id]));
    const defaultAccount = await prisma.chartOfAccount.findUnique({
      where: { code: ACCOUNT_CODES.PURCHASE_PAPER_MATERIAL },
      select: { id: true },
    });

    let subtotal = 0;
    let taxableValue = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let supplyType: Awaited<ReturnType<typeof gstService.split>>['supplyType'] = 'INTRA_STATE';

    const rows: Prisma.PurchaseBillItemCreateWithoutBillInput[] = [];

    for (const [index, item] of items.entries()) {
      const gross = round2(item.quantity * item.unitPrice);
      const lineTaxable = round2(gross - item.discount);
      const split = await gstService.split({
        taxableValue: lineTaxable,
        ratePercent: item.gstRate,
        placeOfSupplyStateCode: placeOfSupply,
      });
      supplyType = split.supplyType;

      subtotal = round2(subtotal + gross);
      taxableValue = round2(taxableValue + lineTaxable);
      cgst = round2(cgst + split.cgst);
      sgst = round2(sgst + split.sgst);
      igst = round2(igst + split.igst);

      rows.push({
        lineNumber: index + 1,
        description: item.description,
        hsnCode: item.hsnCode ?? null,
        ...(item.materialId ? { material: { connect: { id: item.materialId } } } : {}),
        quantity: new Prisma.Decimal(item.quantity),
        uom: item.uom ?? null,
        unitPrice: new Prisma.Decimal(item.unitPrice),
        discount: new Prisma.Decimal(item.discount),
        taxableValue: new Prisma.Decimal(lineTaxable),
        gstRate: new Prisma.Decimal(item.gstRate),
        cgstAmount: new Prisma.Decimal(split.cgst),
        sgstAmount: new Prisma.Decimal(split.sgst),
        igstAmount: new Prisma.Decimal(split.igst),
        total: new Prisma.Decimal(round2(lineTaxable + split.cgst + split.sgst + split.igst)),
        expenseAccountId:
          (item.expenseAccountCode ? idByCode.get(item.expenseAccountCode) : undefined) ?? defaultAccount?.id ?? null,
      });
    }

    // A bill-level discount reduces the taxable base proportionally; recomputing tax on the
    // reduced base is what keeps the bill's own GST figure matching the supplier's document.
    const netTaxable = round2(taxableValue - billDiscount);
    const scale = taxableValue === 0 ? 0 : netTaxable / taxableValue;

    return {
      subtotal,
      taxableValue: netTaxable,
      cgst: round2(cgst * scale),
      sgst: round2(sgst * scale),
      igst: round2(igst * scale),
      total: round2(netTaxable + cgst * scale + sgst * scale + igst * scale),
      supplyType,
      items: rows,
    };
  }

  private async outstandingBySupplier(supplierIds: string[]): Promise<Map<string, number>> {
    if (supplierIds.length === 0) return new Map();
    const grouped = await prisma.purchaseBill.groupBy({
      by: ['supplierId'],
      where: {
        supplierId: { in: supplierIds },
        status: { in: [PurchaseBillStatus.APPROVED, PurchaseBillStatus.PARTIALLY_PAID] },
      },
      _sum: { total: true, amountPaid: true },
    });
    return new Map(
      grouped.map((row) => [row.supplierId, round2(n(row._sum.total) - n(row._sum.amountPaid))]),
    );
  }

  private async nextSupplierCode(): Promise<string> {
    const last = await prisma.supplier.findFirst({
      where: { code: { startsWith: 'SUP-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const lastNumber = last ? Number.parseInt(last.code.replace('SUP-', ''), 10) || 0 : 0;
    return `SUP-${String(lastNumber + 1).padStart(5, '0')}`;
  }
}

export const purchasesService = new PurchasesService();

import { ExpenseStatus, JournalSourceType, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  allocateVoucherNumber,
  fiscalService,
  gstService,
  syncAccountingFor,
  VOUCHER_SERIES,
} from '../../services/accounting/index.js';
import { mapExpenseToDto } from './expenses.utils.js';
import type { ExpenseWithRelations } from './expenses.types.js';
import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  ExpenseListQuery,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
} from './expenses.validation.js';

const INCLUDE = {
  category: { select: { id: true, name: true } },
  supplier: { select: { name: true } },
  paidFromAccount: { select: { name: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  approvedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ExpenseInclude;

/**
 * Business spending.
 *
 * Two decisions here are worth stating, because they are what make the expense screen usable by
 * whoever is actually at the counter rather than only by an accountant:
 *
 *  - **The user enters an amount and a GST rate; the system does the tax.** Splitting 18% into
 *    9+9 or a single IGST line depending on the supplier's state is exactly the arithmetic people
 *    get wrong, so it is never asked for.
 *  - **The expense posts itself.** There is no "post to ledger" button. Saving an approved expense
 *    triggers the accounting projection, and the P&L is correct seconds later.
 */
export class ExpensesService {
  async list(query: ExpenseListQuery) {
    const where: Prisma.ExpenseWhereInput = {
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...(query.status && { status: query.status }),
      ...(query.paymentMode && { paymentMode: query.paymentMode }),
      ...((query.from || query.to) && {
        expenseDate: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...(query.search && {
        OR: [
          { expenseNumber: { contains: query.search, mode: 'insensitive' as const } },
          { description: { contains: query.search, mode: 'insensitive' as const } },
          { payeeName: { contains: query.search, mode: 'insensitive' as const } },
          { supplierInvoiceNumber: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [expenses, total, agg, byCategory] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({
        where,
        _sum: { taxableAmount: true, cgstAmount: true, sgstAmount: true, igstAmount: true, totalAmount: true },
      }),
      prisma.expense.groupBy({ by: ['categoryId'], where, _sum: { totalAmount: true }, _count: { _all: true } }),
    ]);

    const categoryNames = new Map(
      (await prisma.expenseCategory.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]),
    );

    const vouchers = await this.voucherNumbersFor(expenses.map((e) => e.id));

    return {
      data: expenses.map((e) => mapExpenseToDto(e as ExpenseWithRelations, vouchers.get(e.id) ?? null)),
      totals: {
        taxableAmount: Number(agg._sum.taxableAmount ?? 0),
        gstAmount:
          Number(agg._sum.cgstAmount ?? 0) + Number(agg._sum.sgstAmount ?? 0) + Number(agg._sum.igstAmount ?? 0),
        totalAmount: Number(agg._sum.totalAmount ?? 0),
      },
      byCategory: byCategory
        .map((row) => ({
          categoryId: row.categoryId,
          categoryName: categoryNames.get(row.categoryId) ?? 'Unknown',
          amount: Number(row._sum.totalAmount ?? 0),
          count: row._count._all,
        }))
        .sort((a, b) => b.amount - a.amount),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  async findById(id: string) {
    const expense = await prisma.expense.findUnique({ where: { id }, include: INCLUDE });
    if (!expense) throw ApiError.notFound('Expense not found');
    const vouchers = await this.voucherNumbersFor([id]);
    return mapExpenseToDto(expense, vouchers.get(id) ?? null);
  }

  async create(input: CreateExpenseInput, userId: string) {
    const category = await prisma.expenseCategory.findUnique({ where: { id: input.categoryId } });
    if (!category?.isActive) throw ApiError.badRequest('Choose an active expense category');

    if (input.paymentMode !== 'CREDIT' && !input.paidFromAccountId) {
      // Not fatal — the posting rules fall back to the default cash/bank account — but the cash
      // position is only trustworthy when the user says which drawer the money left.
      const hasAccounts = await prisma.cashBankAccount.count({ where: { isActive: true } });
      if (hasAccounts > 0) {
        throw ApiError.badRequest('Select which cash or bank account this was paid from');
      }
    }
    if (input.paymentMode === 'CREDIT' && !input.supplierId) {
      throw ApiError.badRequest('An unpaid expense needs a supplier so it shows up in payables');
    }

    const tax = await gstService.split({
      taxableValue: input.taxableAmount,
      ratePercent: input.gstRate,
      placeOfSupplyStateCode: input.placeOfSupplyStateCode,
    });
    const total = Math.round((input.taxableAmount + tax.cgst + tax.sgst + tax.igst) * 100) / 100;

    if (input.tdsAmount > total) {
      throw ApiError.badRequest('TDS cannot exceed the total amount of the expense');
    }

    const { fiscalYear } = await fiscalService.coordinatesFor(input.expenseDate);

    const expense = await prisma.$transaction(async (tx) => {
      const expenseNumber = await allocateVoucherNumber(tx, VOUCHER_SERIES.EXPENSE, fiscalYear);
      return tx.expense.create({
        data: {
          expenseNumber,
          categoryId: input.categoryId,
          expenseDate: input.expenseDate,
          description: input.description,
          payeeName: input.payeeName ?? null,
          supplierId: input.supplierId ?? null,
          taxableAmount: new Prisma.Decimal(input.taxableAmount),
          gstRate: new Prisma.Decimal(input.gstRate),
          cgstAmount: new Prisma.Decimal(tax.cgst),
          sgstAmount: new Prisma.Decimal(tax.sgst),
          igstAmount: new Prisma.Decimal(tax.igst),
          tdsAmount: new Prisma.Decimal(input.tdsAmount),
          totalAmount: new Prisma.Decimal(total),
          // Snapshot the category's default so changing the category later cannot rewrite history.
          inputCreditEligible: input.inputCreditEligible ?? category.inputCreditEligible,
          supplierGstin: input.supplierGstin ?? null,
          supplierInvoiceNumber: input.supplierInvoiceNumber ?? null,
          supplierInvoiceDate: input.supplierInvoiceDate ?? null,
          hsnCode: input.hsnCode ?? null,
          paymentMode: input.paymentMode,
          paidFromAccountId: input.paidFromAccountId ?? null,
          departmentId: input.departmentId ?? null,
          attachmentUrl: input.attachmentUrl ?? null,
          notes: input.notes ?? null,
          status: input.paymentMode === 'CREDIT' ? ExpenseStatus.APPROVED : ExpenseStatus.PAID,
          createdById: userId,
          approvedById: userId,
          approvedAt: new Date(),
        },
        include: INCLUDE,
      });
    });

    syncAccountingFor('expenses', userId);
    return mapExpenseToDto(expense);
  }

  /**
   * Editing is only allowed before the expense has reached the ledger. Once it is posted, the
   * correct move is a reversal — silently rewriting a posted document is how books stop being
   * trustworthy.
   */
  async update(id: string, input: UpdateExpenseInput, userId: string) {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Expense not found');

    const postedCount = await prisma.journalEntry.count({
      where: { sourceType: JournalSourceType.EXPENSE, sourceId: id, status: 'POSTED' },
    });
    if (postedCount > 0) {
      throw ApiError.badRequest(
        'This expense is already in the ledger. Cancel it (which posts a reversal) and record a corrected one.',
      );
    }

    const taxableAmount = input.taxableAmount ?? Number(existing.taxableAmount);
    const gstRate = input.gstRate ?? Number(existing.gstRate);
    const tax = await gstService.split({
      taxableValue: taxableAmount,
      ratePercent: gstRate,
      placeOfSupplyStateCode: input.placeOfSupplyStateCode,
    });
    const total = Math.round((taxableAmount + tax.cgst + tax.sgst + tax.igst) * 100) / 100;

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        ...(input.categoryId && { categoryId: input.categoryId }),
        ...(input.expenseDate && { expenseDate: input.expenseDate }),
        ...(input.description && { description: input.description }),
        ...(input.payeeName !== undefined && { payeeName: input.payeeName }),
        ...(input.supplierId !== undefined && { supplierId: input.supplierId }),
        taxableAmount: new Prisma.Decimal(taxableAmount),
        gstRate: new Prisma.Decimal(gstRate),
        cgstAmount: new Prisma.Decimal(tax.cgst),
        sgstAmount: new Prisma.Decimal(tax.sgst),
        igstAmount: new Prisma.Decimal(tax.igst),
        totalAmount: new Prisma.Decimal(total),
        ...(input.tdsAmount !== undefined && { tdsAmount: new Prisma.Decimal(input.tdsAmount) }),
        ...(input.inputCreditEligible !== undefined && { inputCreditEligible: input.inputCreditEligible }),
        ...(input.paymentMode && { paymentMode: input.paymentMode }),
        ...(input.paidFromAccountId !== undefined && { paidFromAccountId: input.paidFromAccountId }),
        ...(input.departmentId !== undefined && { departmentId: input.departmentId }),
        ...(input.attachmentUrl !== undefined && { attachmentUrl: input.attachmentUrl }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.supplierGstin !== undefined && { supplierGstin: input.supplierGstin }),
        ...(input.supplierInvoiceNumber !== undefined && { supplierInvoiceNumber: input.supplierInvoiceNumber }),
        ...(input.hsnCode !== undefined && { hsnCode: input.hsnCode }),
      },
      include: INCLUDE,
    });

    syncAccountingFor('expenses', userId);
    return mapExpenseToDto(updated);
  }

  async setStatus(id: string, status: ExpenseStatus, userId: string, notes?: string) {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Expense not found');

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        status,
        notes: notes ?? existing.notes,
        ...(status === ExpenseStatus.APPROVED || status === ExpenseStatus.PAID
          ? { approvedById: userId, approvedAt: new Date() }
          : {}),
      },
      include: INCLUDE,
    });

    if (status === ExpenseStatus.APPROVED || status === ExpenseStatus.PAID) {
      syncAccountingFor('expenses', userId);
    }
    return mapExpenseToDto(updated);
  }

  // ── Categories ──────────────────────────────────────────────────────────────

  async listCategories(includeInactive: boolean) {
    const categories = await prisma.expenseCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { ledgerAccount: { select: { code: true, name: true } }, _count: { select: { expenses: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      ledgerAccountCode: c.ledgerAccount.code,
      ledgerAccountName: c.ledgerAccount.name,
      inputCreditEligible: c.inputCreditEligible,
      isSystem: c.isSystem,
      isActive: c.isActive,
      sortOrder: c.sortOrder,
      expenseCount: c._count.expenses,
    }));
  }

  async createCategory(input: CreateExpenseCategoryInput) {
    const account = await prisma.chartOfAccount.findUnique({ where: { code: input.ledgerAccountCode } });
    if (!account) throw ApiError.badRequest(`No ledger account with code ${input.ledgerAccountCode}`);
    if (account.type !== 'EXPENSE') {
      throw ApiError.badRequest('An expense category must map to an expense-type ledger account');
    }
    return prisma.expenseCategory.create({
      data: {
        code: input.code,
        name: input.name,
        ledgerAccountId: account.id,
        parentId: input.parentId ?? null,
        inputCreditEligible: input.inputCreditEligible,
        sortOrder: input.sortOrder,
      },
    });
  }

  async updateCategory(id: string, input: UpdateExpenseCategoryInput) {
    const category = await prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw ApiError.notFound('Expense category not found');

    let ledgerAccountId: string | undefined;
    if (input.ledgerAccountCode) {
      const account = await prisma.chartOfAccount.findUnique({ where: { code: input.ledgerAccountCode } });
      if (!account) throw ApiError.badRequest(`No ledger account with code ${input.ledgerAccountCode}`);
      ledgerAccountId = account.id;
    }

    return prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(ledgerAccountId && { ledgerAccountId }),
        ...(input.parentId !== undefined && { parentId: input.parentId }),
        ...(input.inputCreditEligible !== undefined && { inputCreditEligible: input.inputCreditEligible }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  }

  /** Voucher numbers for a page of expenses, so the UI can link each one to its journal entry. */
  private async voucherNumbersFor(expenseIds: string[]): Promise<Map<string, string>> {
    if (expenseIds.length === 0) return new Map();
    const entries = await prisma.journalEntry.findMany({
      where: { sourceType: JournalSourceType.EXPENSE, sourceId: { in: expenseIds } },
      select: { sourceId: true, voucherNumber: true },
    });
    return new Map(entries.filter((e) => e.sourceId).map((e) => [e.sourceId as string, e.voucherNumber]));
  }
}

export const expensesService = new ExpensesService();

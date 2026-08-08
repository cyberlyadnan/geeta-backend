import { FinancialActorType } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { creditLedgerService, financialEventService } from '../../services/ledger/index.js';
import { decimalToNumber } from '../../utils/money.js';
import type {
  ListCreditTransactionsQuery,
  ListFinancialEventsQuery,
  RecordRepaymentInput,
  SetCreditLimitInput,
} from './admin-credit.validation.js';

/** Narrow slice of the Prisma client this service needs — injectable so tests can drive the
 *  whole flow with a hand-rolled fake instead of monkey-patching the real (proxy-based) Prisma
 *  client, which node:test's mock.method cannot patch (see retail-customer.service tests). */
export type AdminCreditDb = Pick<typeof prisma, 'user' | 'retailCustomer' | 'creditAccount'>;

export class AdminCreditService {
  constructor(private readonly db: AdminCreditDb = prisma) {}

  async setVendorCreditLimit(vendorUserId: string, input: SetCreditLimitInput) {
    const vendor = await this.db.user.findFirst({
      where: { id: vendorUserId, deletedAt: null },
      select: { id: true, vendorProfile: { select: { id: true } } },
    });
    if (!vendor?.vendorProfile) throw ApiError.notFound('Vendor not found');

    return creditLedgerService.setCreditLimit({
      actorType: FinancialActorType.VENDOR,
      actorId: vendor.id,
      creditLimit: input.creditLimit,
    });
  }

  async setRetailCustomerCreditLimit(retailCustomerId: string, input: SetCreditLimitInput) {
    const retailCustomer = await this.db.retailCustomer.findUnique({
      where: { id: retailCustomerId },
      select: { id: true },
    });
    if (!retailCustomer) throw ApiError.notFound('Retail customer not found');

    return creditLedgerService.setCreditLimit({
      actorType: FinancialActorType.RETAIL_CUSTOMER,
      actorId: retailCustomer.id,
      creditLimit: input.creditLimit,
    });
  }

  /**
   * Every credit account with its actor's display name resolved.
   *
   * `actorId` is polymorphic — a User.id for vendors, a RetailCustomer.id for walk-ins — so the
   * names are looked up per actor kind rather than joined.
   */
  async listAccounts(query: { search?: string; page: number; limit: number }) {
    const [accounts, total] = await Promise.all([
      this.db.creditAccount.findMany({
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.creditAccount.count(),
    ]);

    const vendorIds = accounts.filter((a) => a.actorType === 'VENDOR').map((a) => a.actorId);
    const retailIds = accounts.filter((a) => a.actorType === 'RETAIL_CUSTOMER').map((a) => a.actorId);

    const [vendors, retails] = await Promise.all([
      vendorIds.length
        ? this.db.user.findMany({
            where: { id: { in: vendorIds } },
            select: { id: true, firstName: true, lastName: true, vendorProfile: { select: { businessName: true } } },
          })
        : Promise.resolve([]),
      retailIds.length
        ? this.db.retailCustomer.findMany({ where: { id: { in: retailIds } }, select: { id: true, name: true, phone: true } })
        : Promise.resolve([]),
    ]);

    const names = new Map<string, string>();
    for (const v of vendors) {
      names.set(v.id, v.vendorProfile?.businessName ?? `${v.firstName} ${v.lastName}`);
    }
    for (const r of retails) names.set(r.id, `${r.name} (${r.phone})`);

    const items = accounts.map((a) => ({
      id: a.id,
      actorType: a.actorType,
      actorId: a.actorId,
      actorName: names.get(a.actorId) ?? 'Unknown',
      creditLimit: decimalToNumber(a.creditLimit),
      outstandingBalance: decimalToNumber(a.outstandingBalance),
      availableCredit: decimalToNumber(a.creditLimit.sub(a.outstandingBalance)),
      updatedAt: a.updatedAt.toISOString(),
    }));

    const filtered = query.search
      ? items.filter((i) => i.actorName.toLowerCase().includes(query.search!.toLowerCase()))
      : items;

    return {
      items: filtered,
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  async recordRepayment(creditAccountId: string, input: RecordRepaymentInput, staffUserId: string) {
    const account = await this.loadAccount(creditAccountId);
    return creditLedgerService.recordRepayment({
      actorType: account.actorType,
      actorId: account.actorId,
      amount: input.amount,
      recordedByUserId: staffUserId,
      note: input.note,
    });
  }

  async listTransactions(creditAccountId: string, query: ListCreditTransactionsQuery) {
    await this.loadAccount(creditAccountId);
    return creditLedgerService.listTransactions({ creditAccountId, ...query });
  }

  async listFinancialEvents(query: ListFinancialEventsQuery) {
    return financialEventService.list(query);
  }

  private async loadAccount(creditAccountId: string) {
    const account = await this.db.creditAccount.findUnique({
      where: { id: creditAccountId },
      select: { id: true, actorType: true, actorId: true },
    });
    if (!account) throw ApiError.notFound('Credit account not found');
    return account;
  }
}

export const adminCreditService = new AdminCreditService();

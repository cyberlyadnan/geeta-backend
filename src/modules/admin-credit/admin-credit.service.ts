import { FinancialActorType } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { creditLedgerService, financialEventService } from '../../services/ledger/index.js';
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

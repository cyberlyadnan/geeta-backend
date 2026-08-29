import { AccountSubType, JournalEntryStatus, type FinancialActorType } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { normaliseRange, round2 } from './report.types.js';

export interface PartyStatement {
  party: { partyType: FinancialActorType; partyId: string; partyName: string };
  range: { from: string; to: string };
  openingBalance: number;
  closingBalance: number;
  rows: {
    date: string;
    voucherNumber: string;
    entryId: string;
    particulars: string;
    sourceType: string;
    debit: number;
    credit: number;
    balance: number;
  }[];
  summary: { totalBilled: number; totalPaid: number; outstanding: number };
}

const PARTY_SUBTYPES = [
  AccountSubType.ACCOUNTS_RECEIVABLE,
  AccountSubType.CREDIT_RECEIVABLE,
  AccountSubType.CUSTOMER_ADVANCE,
  AccountSubType.CUSTOMER_WALLET_LIABILITY,
];

/**
 * A single customer's account with the business, as a statement you can email them: every charge,
 * every payment, a running balance, and what is still open.
 *
 * It reads the party dimension on the journal lines rather than the order tables, so a customer's
 * wallet top-up, their counter cash, their Udhar and their invoices all appear in one chronology —
 * which is the thing neither the order screen nor the wallet screen could ever show.
 */
export class PartyStatementService {
  async build(options: {
    partyType: FinancialActorType;
    partyId: string;
    from?: Date;
    to?: Date;
  }): Promise<PartyStatement> {
    const range = normaliseRange(options.from, options.to);

    const accounts = await prisma.chartOfAccount.findMany({
      where: { subType: { in: PARTY_SUBTYPES } },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const baseWhere = {
      accountId: { in: accountIds },
      partyType: options.partyType,
      partyId: options.partyId,
    };

    const [openingAgg, lines] = await Promise.all([
      prisma.journalLine.aggregate({
        where: {
          ...baseWhere,
          journalEntry: { status: JournalEntryStatus.POSTED, entryDate: { lt: range.from } },
        },
        _sum: { debit: true, credit: true },
      }),
      prisma.journalLine.findMany({
        where: {
          ...baseWhere,
          journalEntry: {
            status: JournalEntryStatus.POSTED,
            entryDate: { gte: range.from, lte: range.to },
          },
        },
        orderBy: [{ journalEntry: { entryDate: 'asc' } }, { createdAt: 'asc' }],
        include: {
          journalEntry: {
            select: { id: true, voucherNumber: true, entryDate: true, narration: true, sourceType: true, partyName: true },
          },
        },
      }),
    ]);

    const opening = round2(Number(openingAgg._sum.debit ?? 0) - Number(openingAgg._sum.credit ?? 0));

    let running = opening;
    let totalBilled = 0;
    let totalPaid = 0;
    const rows = lines.map((line) => {
      const debit = round2(Number(line.debit));
      const credit = round2(Number(line.credit));
      running = round2(running + debit - credit);
      totalBilled = round2(totalBilled + debit);
      totalPaid = round2(totalPaid + credit);
      return {
        date: line.journalEntry.entryDate.toISOString(),
        voucherNumber: line.journalEntry.voucherNumber,
        entryId: line.journalEntry.id,
        particulars: line.description ?? line.journalEntry.narration,
        sourceType: line.journalEntry.sourceType,
        debit,
        credit,
        balance: running,
      };
    });

    const partyName =
      lines.find((l) => l.journalEntry.partyName)?.journalEntry.partyName ??
      (await this.lookupName(options.partyType, options.partyId));

    return {
      party: { partyType: options.partyType, partyId: options.partyId, partyName },
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      openingBalance: opening,
      closingBalance: running,
      rows,
      summary: { totalBilled, totalPaid, outstanding: running },
    };
  }

  private async lookupName(partyType: FinancialActorType, partyId: string): Promise<string> {
    if (partyType === 'RETAIL_CUSTOMER') {
      const customer = await prisma.retailCustomer.findUnique({ where: { id: partyId }, select: { name: true } });
      return customer?.name ?? 'Unknown customer';
    }
    const user = await prisma.user.findUnique({
      where: { id: partyId },
      select: { firstName: true, lastName: true, vendorProfile: { select: { businessName: true } } },
    });
    return user?.vendorProfile?.businessName ?? (user ? `${user.firstName} ${user.lastName}` : 'Unknown customer');
  }
}

export const partyStatementService = new PartyStatementService();

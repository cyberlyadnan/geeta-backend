import { AccountSubType, JournalEntryStatus, type FinancialActorType } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { round2 } from './report.types.js';
import { AGEING_BUCKETS, applyPaymentsFifo, bucketIndexForDays } from './ageing-math.js';

export interface AgeingBucket {
  label: string;
  from: number;
  to: number | null;
  amount: number;
}

export interface AgeingRow {
  partyType: FinancialActorType | 'SUPPLIER';
  partyId: string;
  partyName: string;
  total: number;
  buckets: AgeingBucket[];
  oldestDays: number;
}

export interface AgeingReport {
  asAt: string;
  kind: 'RECEIVABLE' | 'PAYABLE';
  rows: AgeingRow[];
  totals: { total: number; buckets: AgeingBucket[] };
}

function emptyBuckets(): AgeingBucket[] {
  return AGEING_BUCKETS.map((bucket) => ({ ...bucket, amount: 0 }));
}

/**
 * Who owes the business money and for how long, and the same for what the business owes.
 *
 * Built by ageing the *open* portion of each party's ledger: newest payments are applied against
 * the oldest invoices (FIFO), which is what a real collections conversation assumes — "your July
 * bill is still open" means the July bill, not a share of every bill.
 */
export class AgeingService {
  async receivables(asAt: Date = new Date()): Promise<AgeingReport> {
    const accounts = await prisma.chartOfAccount.findMany({
      where: { subType: { in: [AccountSubType.ACCOUNTS_RECEIVABLE, AccountSubType.CREDIT_RECEIVABLE] } },
      select: { id: true },
    });
    const lines = await prisma.journalLine.findMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        partyId: { not: null },
        journalEntry: { status: JournalEntryStatus.POSTED, entryDate: { lte: asAt } },
      },
      select: {
        debit: true,
        credit: true,
        partyId: true,
        partyType: true,
        journalEntry: { select: { entryDate: true, partyName: true } },
      },
      orderBy: { journalEntry: { entryDate: 'asc' } },
    });

    const grouped = new Map<
      string,
      { partyType: FinancialActorType; partyId: string; partyName: string; movements: { date: Date; amount: number }[] }
    >();

    for (const line of lines) {
      const key = `${line.partyType}:${line.partyId}`;
      const entry =
        grouped.get(key) ??
        {
          partyType: line.partyType as FinancialActorType,
          partyId: line.partyId as string,
          partyName: line.journalEntry.partyName ?? 'Unknown',
          movements: [],
        };
      if (line.journalEntry.partyName) entry.partyName = line.journalEntry.partyName;
      entry.movements.push({
        date: line.journalEntry.entryDate,
        amount: round2(Number(line.debit) - Number(line.credit)),
      });
      grouped.set(key, entry);
    }

    return this.assemble('RECEIVABLE', asAt, [...grouped.values()]);
  }

  async payables(asAt: Date = new Date()): Promise<AgeingReport> {
    const accounts = await prisma.chartOfAccount.findMany({
      where: { subType: { in: [AccountSubType.ACCOUNTS_PAYABLE, AccountSubType.ACCRUED_LIABILITY] } },
      select: { id: true },
    });
    const lines = await prisma.journalLine.findMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        supplierId: { not: null },
        journalEntry: { status: JournalEntryStatus.POSTED, entryDate: { lte: asAt } },
      },
      select: {
        debit: true,
        credit: true,
        supplierId: true,
        supplier: { select: { name: true } },
        journalEntry: { select: { entryDate: true } },
      },
      orderBy: { journalEntry: { entryDate: 'asc' } },
    });

    const grouped = new Map<
      string,
      { partyType: 'SUPPLIER'; partyId: string; partyName: string; movements: { date: Date; amount: number }[] }
    >();

    for (const line of lines) {
      const key = line.supplierId as string;
      const entry =
        grouped.get(key) ??
        { partyType: 'SUPPLIER' as const, partyId: key, partyName: line.supplier?.name ?? 'Unknown supplier', movements: [] };
      // Payables are credit-normal: a credit increases what is owed.
      entry.movements.push({
        date: line.journalEntry.entryDate,
        amount: round2(Number(line.credit) - Number(line.debit)),
      });
      grouped.set(key, entry);
    }

    return this.assemble('PAYABLE', asAt, [...grouped.values()]);
  }

  /**
   * FIFO application: walk the party's movements oldest-first, letting each payment consume the
   * oldest still-open charge. Whatever charges remain are aged by their own date.
   */
  private assemble(
    kind: 'RECEIVABLE' | 'PAYABLE',
    asAt: Date,
    parties: {
      partyType: FinancialActorType | 'SUPPLIER';
      partyId: string;
      partyName: string;
      movements: { date: Date; amount: number }[];
    }[],
  ): AgeingReport {
    const rows: AgeingRow[] = [];

    for (const party of parties) {
      const outstanding = applyPaymentsFifo(party.movements);
      const total = round2(outstanding.reduce((s, c) => s + c.amount, 0));
      if (total <= 0.009) continue;

      const buckets = emptyBuckets();
      let oldestDays = 0;
      for (const charge of outstanding) {
        const days = Math.max(0, Math.floor((asAt.getTime() - charge.date.getTime()) / 86_400_000));
        oldestDays = Math.max(oldestDays, days);
        const index = bucketIndexForDays(days);
        buckets[index]!.amount = round2(buckets[index]!.amount + charge.amount);
      }

      rows.push({
        partyType: party.partyType,
        partyId: party.partyId,
        partyName: party.partyName,
        total,
        buckets,
        oldestDays,
      });
    }

    rows.sort((a, b) => b.total - a.total);

    const totalBuckets = emptyBuckets();
    for (const row of rows) {
      row.buckets.forEach((bucket, index) => {
        totalBuckets[index]!.amount = round2(totalBuckets[index]!.amount + bucket.amount);
      });
    }

    return {
      asAt: asAt.toISOString(),
      kind,
      rows,
      totals: {
        total: round2(rows.reduce((s, r) => s + r.total, 0)),
        buckets: totalBuckets,
      },
    };
  }
}

export const ageingService = new AgeingService();

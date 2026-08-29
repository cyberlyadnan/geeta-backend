import {
  JournalEntryStatus,
  type JournalSourceType,
  Prisma,
  type FinancialActorType,
  type JournalEntry,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { logger } from '../../logs/logger.js';
import { ACCOUNT_CODES } from './account-codes.js';
import { accountResolver } from './account-resolver.service.js';
import { fiscalService } from './fiscal.service.js';
import { allocateVoucherNumber, VOUCHER_SERIES, type VoucherSeries } from './voucher-number.service.js';

/** One side of an entry, expressed against an account CODE — never an id. */
export interface PostingLineInput {
  accountCode: string;
  debit?: number | Prisma.Decimal;
  credit?: number | Prisma.Decimal;
  description?: string;
  partyType?: FinancialActorType | null;
  partyId?: string | null;
  supplierId?: string | null;
  departmentId?: string | null;
  hsnCode?: string | null;
  taxRate?: number | null;
  taxableValue?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
}

export interface PostEntryInput {
  entryDate: Date;
  sourceType: JournalSourceType;
  /** Id of the originating document. */
  sourceId?: string | null;
  /**
   * Idempotency key within the source type. Defaults to sourceId. Suffix it when one document
   * produces several entries — e.g. `${invoiceId}:advance`.
   */
  sourceKey?: string;
  narration: string;
  lines: PostingLineInput[];
  partyType?: FinancialActorType | null;
  partyId?: string | null;
  partyName?: string | null;
  series?: VoucherSeries;
  createdByUserId?: string | null;
  isSystemGenerated?: boolean;
  metadata?: Prisma.InputJsonValue;
  /** SUPER_ADMIN back-dating into a CLOSED (never LOCKED) period. */
  allowClosedPeriod?: boolean;
}

export interface PostResult {
  entry: JournalEntry;
  /** True when the entry already existed and this call was a no-op. */
  deduplicated: boolean;
}

const ZERO = new Prisma.Decimal(0);

function d(value: number | Prisma.Decimal | undefined | null): Prisma.Decimal {
  if (value === undefined || value === null) return ZERO;
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Two-paise tolerance absorbs Decimal rounding when a tax split is apportioned across lines. */
const BALANCE_TOLERANCE = new Prisma.Decimal('0.02');

const DEFAULT_SERIES: Record<JournalSourceType, VoucherSeries> = {
  OPENING_BALANCE: VOUCHER_SERIES.JOURNAL,
  WALLET_TOPUP: VOUCHER_SERIES.RECEIPT,
  WALLET_ADJUSTMENT: VOUCHER_SERIES.JOURNAL,
  ORDER_ADVANCE: VOUCHER_SERIES.JOURNAL,
  UDHAR_DRAW: VOUCHER_SERIES.JOURNAL,
  UDHAR_REPAYMENT: VOUCHER_SERIES.RECEIPT,
  COUNTER_RECEIPT: VOUCHER_SERIES.RECEIPT,
  SALES_INVOICE: VOUCHER_SERIES.SALES,
  ADVANCE_APPLICATION: VOUCHER_SERIES.JOURNAL,
  CREDIT_NOTE: VOUCHER_SERIES.CREDIT_NOTE,
  REFUND_PAYOUT: VOUCHER_SERIES.PAYMENT,
  EXPENSE: VOUCHER_SERIES.EXPENSE,
  PURCHASE_BILL: VOUCHER_SERIES.PURCHASE,
  SUPPLIER_PAYMENT: VOUCHER_SERIES.PAYMENT,
  BANK_TRANSACTION: VOUCHER_SERIES.CONTRA,
  GATEWAY_SETTLEMENT: VOUCHER_SERIES.CONTRA,
  MANUAL_JOURNAL: VOUCHER_SERIES.JOURNAL,
  DEPRECIATION: VOUCHER_SERIES.JOURNAL,
  PERIOD_CLOSE: VOUCHER_SERIES.JOURNAL,
};

/**
 * The only way a journal entry is ever created.
 *
 * Three guarantees this class exists to provide, in order of importance:
 *   1. **Balanced.** Debits equal credits or the write is refused. There is no code path that
 *      writes JournalEntry/JournalLine directly, so an unbalanced entry cannot exist.
 *   2. **Idempotent.** (sourceType, sourceKey) is unique in the database. A duplicate post is
 *      swallowed and reported as `deduplicated`, which is what lets the projection run inline, on
 *      a schedule, and as a historical backfill using one code path.
 *   3. **Immutable.** No update, no delete. A wrong entry is corrected by `reverse()`, which posts
 *      the mirror image and links the two — the audit trail a CA can actually follow.
 */
export class PostingService {
  async post(input: PostEntryInput, existingTx?: Prisma.TransactionClient): Promise<PostResult> {
    const sourceKey = input.sourceKey ?? input.sourceId;
    if (!sourceKey) {
      throw ApiError.internal('A journal entry needs either a sourceId or an explicit sourceKey');
    }

    const prepared = await this.prepare(input);

    const run = async (tx: Prisma.TransactionClient): Promise<PostResult> => {
      const existing = await tx.journalEntry.findUnique({
        where: { sourceType_sourceKey: { sourceType: input.sourceType, sourceKey } },
      });
      if (existing) return { entry: existing, deduplicated: true };

      const voucherNumber = await allocateVoucherNumber(
        tx,
        input.series ?? DEFAULT_SERIES[input.sourceType],
        prepared.coords.fiscalYear,
      );

      const entry = await tx.journalEntry.create({
        data: {
          voucherNumber,
          entryDate: input.entryDate,
          fiscalYear: prepared.coords.fiscalYear,
          fiscalPeriod: prepared.coords.fiscalPeriod,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          sourceKey,
          status: JournalEntryStatus.POSTED,
          narration: input.narration,
          partyType: input.partyType ?? null,
          partyId: input.partyId ?? null,
          partyName: input.partyName ?? null,
          totalDebit: prepared.totalDebit,
          totalCredit: prepared.totalCredit,
          isSystemGenerated: input.isSystemGenerated ?? true,
          createdByUserId: input.createdByUserId ?? null,
          metadata: input.metadata ?? {},
          lines: { create: prepared.lines },
        },
      });

      return { entry, deduplicated: false };
    };

    if (existingTx) return run(existingTx);

    try {
      return await prisma.$transaction(run);
    } catch (error) {
      // Two concurrent projections racing on the same source document: the loser sees the unique
      // violation, which means the entry exists — the desired end state either way.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const entry = await prisma.journalEntry.findUnique({
          where: { sourceType_sourceKey: { sourceType: input.sourceType, sourceKey } },
        });
        if (entry) return { entry, deduplicated: true };
      }
      throw error;
    }
  }

  /**
   * Same contract as `post`, but a failure is logged instead of thrown. Used where accounting must
   * never be able to break an operational write (recording a counter payment must succeed even if
   * the chart of accounts is misconfigured) — the projection reconciler picks the entry up on its
   * next pass, so nothing is lost, only delayed.
   */
  async postSafe(input: PostEntryInput, existingTx?: Prisma.TransactionClient): Promise<PostResult | null> {
    try {
      return await this.post(input, existingTx);
    } catch (error) {
      logger.error('Journal posting failed; the projection reconciler will retry this document', {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Posts the mirror image of an entry and links the two. The reversal is dated today (or on a
   * caller-supplied date) rather than on the original's date, so a period that has already been
   * reported does not silently change.
   */
  async reverse(
    entryId: string,
    options: { reason: string; userId: string; reversalDate?: Date; allowClosedPeriod?: boolean },
  ): Promise<JournalEntry> {
    const original = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });
    if (!original) throw ApiError.notFound('Journal entry not found');
    if (original.status === JournalEntryStatus.REVERSED) {
      throw ApiError.badRequest('This entry has already been reversed');
    }

    const reversalDate = options.reversalDate ?? new Date();
    const { entry } = await this.post(
      {
        entryDate: reversalDate,
        sourceType: original.sourceType,
        sourceId: original.sourceId,
        sourceKey: `reversal:${original.id}`,
        narration: `Reversal of ${original.voucherNumber} — ${options.reason}`,
        partyType: original.partyType,
        partyId: original.partyId,
        partyName: original.partyName,
        createdByUserId: options.userId,
        isSystemGenerated: false,
        allowClosedPeriod: options.allowClosedPeriod,
        metadata: { reversalOf: original.id, reason: options.reason },
        lines: original.lines.map((line) => ({
          accountCode: line.account.code,
          // Swap the sides — that is the whole of a reversal.
          debit: line.credit,
          credit: line.debit,
          description: line.description ?? undefined,
          partyType: line.partyType,
          partyId: line.partyId,
          supplierId: line.supplierId,
          departmentId: line.departmentId,
          referenceType: line.referenceType,
          referenceId: line.referenceId,
        })),
      },
    );

    await prisma.$transaction([
      prisma.journalEntry.update({
        where: { id: entry.id },
        data: { reversalOfId: original.id },
      }),
      prisma.journalEntry.update({
        where: { id: original.id },
        data: { status: JournalEntryStatus.REVERSED, reversalReason: options.reason },
      }),
    ]);

    return entry;
  }

  /** Resolves account codes, validates the entry, and computes totals. */
  private async prepare(input: PostEntryInput) {
    if (input.lines.length < 2) {
      throw ApiError.badRequest('A journal entry needs at least two lines');
    }

    const coords = await fiscalService.assertPostable(input.entryDate, {
      allowClosedOverride: input.allowClosedPeriod,
    });

    const codes = [...new Set(input.lines.map((l) => l.accountCode))];
    const ids = await accountResolver.idsFor(codes);

    let totalDebit = ZERO;
    let totalCredit = ZERO;
    const lines: Prisma.JournalLineCreateWithoutJournalEntryInput[] = [];

    for (const line of input.lines) {
      const debit = d(line.debit);
      const credit = d(line.credit);

      if (debit.lt(0) || credit.lt(0)) {
        throw ApiError.badRequest('Journal amounts cannot be negative — swap the side instead');
      }
      if (debit.gt(0) && credit.gt(0)) {
        throw ApiError.badRequest('A journal line is either a debit or a credit, never both');
      }
      // Drop zero lines rather than storing noise.
      if (debit.eq(0) && credit.eq(0)) continue;

      totalDebit = totalDebit.plus(debit);
      totalCredit = totalCredit.plus(credit);

      lines.push({
        lineNumber: lines.length + 1,
        account: { connect: { id: ids.get(line.accountCode)! } },
        debit,
        credit,
        description: line.description ?? null,
        partyType: line.partyType ?? null,
        partyId: line.partyId ?? null,
        ...(line.supplierId ? { supplier: { connect: { id: line.supplierId } } } : {}),
        ...(line.departmentId ? { department: { connect: { id: line.departmentId } } } : {}),
        hsnCode: line.hsnCode ?? null,
        taxRate: line.taxRate == null ? null : new Prisma.Decimal(line.taxRate),
        taxableValue: line.taxableValue == null ? null : new Prisma.Decimal(line.taxableValue),
        referenceType: line.referenceType ?? null,
        referenceId: line.referenceId ?? null,
      });
    }

    if (lines.length < 2) {
      throw ApiError.badRequest('A journal entry needs at least two non-zero lines');
    }

    const difference = totalDebit.minus(totalCredit).abs();
    if (difference.gt(BALANCE_TOLERANCE)) {
      throw ApiError.internal(
        `Journal entry does not balance: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}`,
      );
    }
    // Within tolerance but not exact — a paisa lost apportioning a tax split. Absorb it into the
    // rounding account rather than storing totals that only "nearly" balance; the entry that
    // reaches the database is always exactly equal on both sides.
    if (difference.gt(0)) {
      const roundingId = await accountResolver.idFor(ACCOUNT_CODES.ROUNDING_DIFFERENCE);
      const shortSide = totalDebit.lt(totalCredit);
      lines.push({
        lineNumber: lines.length + 1,
        account: { connect: { id: roundingId } },
        debit: shortSide ? difference : ZERO,
        credit: shortSide ? ZERO : difference,
        description: 'Rounding difference',
      });
      if (shortSide) totalDebit = totalDebit.plus(difference);
      else totalCredit = totalCredit.plus(difference);
    }

    return { coords, lines, totalDebit, totalCredit };
  }
}

export const postingService = new PostingService();

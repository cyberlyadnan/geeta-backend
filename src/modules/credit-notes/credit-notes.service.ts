import { CreditNoteStatus, Prisma, RefundMode } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  allocateVoucherNumber,
  financeSettingsService,
  fiscalService,
  gstService,
  postingService,
  syncAccountingFor,
  VOUCHER_SERIES,
} from '../../services/accounting/index.js';
import type { CreateCreditNoteInput, CreditNoteListQuery } from './credit-notes.validation.js';

const n = (v: Prisma.Decimal | null | undefined): number => (v == null ? 0 : v.toNumber());
const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Credit notes — the lawful, and only, way to reverse an issued tax invoice.
 *
 * The reason this is its own module rather than a flag on the cancellation flow: a refund and a
 * credit note are different facts with different consequences. Cancelling an order and returning
 * the customer's money changes the bank balance; issuing a credit note changes what the business
 * owes the GST department. A system that records only the first over-pays tax on revenue it never
 * kept, every single month, and nobody notices until an audit.
 */
export class CreditNotesService {
  async list(query: CreditNoteListQuery) {
    const where: Prisma.CreditNoteWhereInput = {
      ...(query.actorType && { actorType: query.actorType }),
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.status && { status: query.status }),
      ...(query.reason && { reason: query.reason }),
      ...((query.from || query.to) && {
        noteDate: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
    };

    const [notes, total, agg] = await Promise.all([
      prisma.creditNote.findMany({
        where,
        include: {
          invoice: { select: { invoiceNumber: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ noteDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.creditNote.count({ where }),
      prisma.creditNote.aggregate({
        where,
        _sum: { taxableValue: true, cgstAmount: true, sgstAmount: true, igstAmount: true, total: true },
      }),
    ]);

    return {
      data: notes.map((note) => ({
        id: note.id,
        creditNoteNumber: note.creditNoteNumber,
        invoiceId: note.invoiceId,
        invoiceNumber: note.invoice?.invoiceNumber ?? null,
        actorType: note.actorType,
        actorId: note.actorId,
        billedToName: note.billedToName,
        gstNumber: note.gstNumber,
        noteDate: note.noteDate.toISOString(),
        reason: note.reason,
        reasonNote: note.reasonNote,
        taxableValue: n(note.taxableValue),
        gstRate: n(note.gstRate),
        cgstAmount: n(note.cgstAmount),
        sgstAmount: n(note.sgstAmount),
        igstAmount: n(note.igstAmount),
        total: n(note.total),
        refundMode: note.refundMode,
        status: note.status,
        createdBy: note.createdBy ? `${note.createdBy.firstName} ${note.createdBy.lastName}` : null,
        createdAt: note.createdAt.toISOString(),
      })),
      totals: {
        taxableValue: n(agg._sum.taxableValue),
        gstAmount: round2(n(agg._sum.cgstAmount) + n(agg._sum.sgstAmount) + n(agg._sum.igstAmount)),
        total: n(agg._sum.total),
      },
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  async findById(id: string) {
    const note = await prisma.creditNote.findUnique({
      where: { id },
      include: { invoice: true, createdBy: { select: { firstName: true, lastName: true } } },
    });
    if (!note) throw ApiError.notFound('Credit note not found');
    return note;
  }

  async create(input: CreateCreditNoteInput, userId: string) {
    const settings = await financeSettingsService.get();

    let invoice = null;
    if (input.invoiceId) {
      invoice = await prisma.invoice.findUnique({ where: { id: input.invoiceId } });
      if (!invoice) throw ApiError.notFound('Invoice not found');

      // A credit note can never exceed what was invoiced, net of what has already been credited.
      const alreadyCredited = await prisma.creditNote.aggregate({
        where: { invoiceId: invoice.id, status: CreditNoteStatus.ISSUED },
        _sum: { taxableValue: true },
      });
      const invoiceTaxable = round2(n(invoice.subtotal) + n(invoice.deliveryCharge));
      const remaining = round2(invoiceTaxable - n(alreadyCredited._sum.taxableValue));
      if (input.taxableValue > remaining + 0.01) {
        throw ApiError.badRequest(
          `Only ${remaining.toFixed(2)} of invoice ${invoice.invoiceNumber} is still creditable`,
        );
      }
    }

    const gstRate = input.gstRate ?? (invoice ? n(invoice.gstRate) * 100 : Number(settings.defaultGstRatePercent));
    const placeOfSupply = invoice?.placeOfSupply ?? settings.homeStateCode;

    const split = await gstService.split({
      taxableValue: input.taxableValue,
      ratePercent: gstRate,
      placeOfSupplyStateCode: placeOfSupply,
    });
    const total = round2(input.taxableValue + split.cgst + split.sgst + split.igst);

    const gstNumber = invoice?.gstNumber ?? null;
    const documentCategory = await gstService.documentCategory({
      buyerGstin: gstNumber,
      supplyType: split.supplyType,
      invoiceTotal: total,
      isCreditNote: true,
    });

    const { fiscalYear } = await fiscalService.coordinatesFor(input.noteDate);

    const note = await prisma.$transaction(async (tx) => {
      const creditNoteNumber = await allocateVoucherNumber(tx, VOUCHER_SERIES.CREDIT_NOTE, fiscalYear);
      return tx.creditNote.create({
        data: {
          creditNoteNumber,
          invoiceId: invoice?.id ?? null,
          orderId: input.orderId ?? null,
          actorType: invoice?.actorType ?? input.actorType!,
          actorId: invoice?.actorId ?? input.actorId!,
          billedToName: invoice?.billedToName ?? input.billedToName!,
          gstNumber,
          noteDate: input.noteDate,
          reason: input.reason,
          reasonNote: input.reasonNote ?? null,
          placeOfSupply,
          supplyType: split.supplyType,
          documentCategory,
          taxableValue: new Prisma.Decimal(input.taxableValue),
          gstRate: new Prisma.Decimal(gstRate),
          cgstAmount: new Prisma.Decimal(split.cgst),
          sgstAmount: new Prisma.Decimal(split.sgst),
          igstAmount: new Prisma.Decimal(split.igst),
          total: new Prisma.Decimal(total),
          refundMode: input.refundMode,
          refundedFromAccountId: input.refundedFromAccountId ?? null,
          // Wallet and adjustment refunds settle the instant the note is issued; a cash or bank
          // refund is stamped when the money is actually handed over, which is the same moment
          // here because the note is only raised once the refund is agreed.
          refundedAt: new Date(),
          status: CreditNoteStatus.ISSUED,
          createdById: userId,
        },
      });
    });

    // A wallet refund has to move the customer's actual balance too, not just the books.
    if (input.refundMode === RefundMode.WALLET) {
      await this.creditCustomerWallet(note.id, note.actorType, note.actorId, total, userId, note.creditNoteNumber);
    }

    syncAccountingFor('credit-notes', userId);
    return note;
  }

  async cancel(id: string, reason: string, userId: string) {
    const note = await prisma.creditNote.findUnique({ where: { id } });
    if (!note) throw ApiError.notFound('Credit note not found');
    if (note.status === CreditNoteStatus.CANCELLED) {
      throw ApiError.badRequest('This credit note is already cancelled');
    }

    const updated = await prisma.creditNote.update({
      where: { id },
      data: { status: CreditNoteStatus.CANCELLED, reasonNote: `${note.reasonNote ?? ''}\nCancelled: ${reason}`.trim() },
    });

    // Reverse both entries the note produced — the tax reversal and the settlement.
    const entries = await prisma.journalEntry.findMany({
      where: { sourceId: id, sourceType: { in: ['CREDIT_NOTE', 'REFUND_PAYOUT'] }, status: 'POSTED' },
    });
    for (const entry of entries) {
      await postingService.reverse(entry.id, { reason: `Credit note cancelled: ${reason}`, userId });
    }

    return updated;
  }

  /**
   * Puts a wallet refund back on the customer's balance through the existing wallet ledger, so the
   * wallet screen, the financial event ledger and the accounting journal all agree. Retail
   * customers have no wallet, so their refunds must use another mode.
   */
  private async creditCustomerWallet(
    creditNoteId: string,
    actorType: string,
    actorId: string,
    amount: number,
    userId: string,
    creditNoteNumber: string,
  ) {
    if (actorType !== 'VENDOR') {
      throw ApiError.badRequest(
        'Walk-in customers have no wallet — refund in cash, by bank transfer, or against a future order',
      );
    }

    const { walletLedgerService } = await import('../../services/ledger/index.js');
    const { WalletTransactionType, FinancialAuditAction, FinancialEventType, FinancialReferenceType } =
      await import('@prisma/client');

    await walletLedgerService.creditWallet({
      userId: actorId,
      amount,
      type: WalletTransactionType.REFUND,
      remarks: `Refund against credit note ${creditNoteNumber}`,
      auditAction: FinancialAuditAction.PAYMENT_REFUND,
      auditActorId: userId,
      referenceNumber: `CN-${creditNoteId.slice(-10)}`,
      financialEvent: {
        eventType: FinancialEventType.REFUND_CREDIT,
        referenceType: FinancialReferenceType.CREDIT_NOTE,
        referenceId: creditNoteId,
        createdByUserId: userId,
      },
    });
  }
}

export const creditNotesService = new CreditNotesService();

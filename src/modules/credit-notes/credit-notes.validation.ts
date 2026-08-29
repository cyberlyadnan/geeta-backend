import { z } from 'zod';
import { CreditNoteReason, CreditNoteStatus, FinancialActorType, RefundMode } from '@prisma/client';

export const creditNoteIdParamSchema = z.object({ id: z.string().cuid() });

export const creditNoteListQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  actorType: z.nativeEnum(FinancialActorType).optional(),
  actorId: z.string().min(1).optional(),
  status: z.nativeEnum(CreditNoteStatus).optional(),
  reason: z.nativeEnum(CreditNoteReason).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export const createCreditNoteSchema = z
  .object({
    /** Preferred path: credit an existing invoice, which fills in the party and tax detail. */
    invoiceId: z.string().cuid().optional(),
    /** Goodwill credit with no invoice behind it — party has to be supplied explicitly. */
    actorType: z.nativeEnum(FinancialActorType).optional(),
    actorId: z.string().min(1).optional(),
    billedToName: z.string().trim().min(2).max(160).optional(),
    orderId: z.string().cuid().optional(),
    noteDate: z.coerce.date(),
    reason: z.nativeEnum(CreditNoteReason),
    reasonNote: z.string().trim().max(600).optional(),
    /** Pre-tax value being credited back. Tax is computed from the invoice's own rate. */
    taxableValue: z.coerce.number().min(0.01).max(99_999_999),
    /** Only needed when there is no invoice to inherit the rate from. */
    gstRate: z.coerce.number().min(0).max(50).optional(),
    refundMode: z.nativeEnum(RefundMode),
    refundedFromAccountId: z.string().cuid().optional(),
  })
  .refine((data) => data.invoiceId || (data.actorType && data.actorId && data.billedToName), {
    message: 'Either credit an invoice, or name the customer being credited',
  })
  .refine(
    (data) =>
      data.refundMode !== 'CASH' && data.refundMode !== 'BANK_TRANSFER' && data.refundMode !== 'UPI'
        ? true
        : Boolean(data.refundedFromAccountId),
    { message: 'Say which cash or bank account the refund is paid from' },
  );

export const cancelCreditNoteSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export type CreditNoteListQuery = z.infer<typeof creditNoteListQuerySchema>;
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>;

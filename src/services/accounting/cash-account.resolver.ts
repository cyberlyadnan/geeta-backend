import { type CashBankAccountType } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ACCOUNT_CODES } from './account-codes.js';

/**
 * Which ledger account counter cash lands in.
 *
 * A business that has set up its cash drawer as a CashBankAccount gets that account; one that has
 * not yet gets the generic Cash in Hand account. Either way a posting never fails for want of
 * configuration — the books are always right at the group level, and get more granular as the
 * business fills in its setup.
 */
export async function resolveDefaultCashAccountCode(): Promise<string> {
  const account = await prisma.cashBankAccount.findFirst({
    where: { isActive: true, isDefaultCash: true },
    select: { ledgerAccount: { select: { code: true } } },
  });
  return account?.ledgerAccount.code ?? ACCOUNT_CODES.CASH_IN_HAND;
}

export async function resolveDefaultBankAccountCode(): Promise<string> {
  const account = await prisma.cashBankAccount.findFirst({
    where: { isActive: true, isDefaultBank: true },
    select: { ledgerAccount: { select: { code: true } } },
  });
  return account?.ledgerAccount.code ?? ACCOUNT_CODES.BANK_ACCOUNTS;
}

/** Ledger code for a specific cash/bank account id, falling back by account type. */
export async function resolveAccountCode(cashBankAccountId: string | null | undefined): Promise<string> {
  if (!cashBankAccountId) return resolveDefaultCashAccountCode();
  const account = await prisma.cashBankAccount.findUnique({
    where: { id: cashBankAccountId },
    select: { type: true, ledgerAccount: { select: { code: true } } },
  });
  if (account) return account.ledgerAccount.code;
  return ACCOUNT_CODES.CASH_IN_HAND;
}

/** The ledger code a payment mode implies when no explicit account was chosen. */
export async function resolveCodeForPaymentMode(
  mode: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT' | 'OTHER',
  explicitAccountId?: string | null,
): Promise<string> {
  if (explicitAccountId) return resolveAccountCode(explicitAccountId);
  switch (mode) {
    case 'CASH':
      return resolveDefaultCashAccountCode();
    case 'UPI':
    case 'CARD':
    case 'BANK_TRANSFER':
    case 'CHEQUE':
      return resolveDefaultBankAccountCode();
    case 'CREDIT':
      return ACCOUNT_CODES.EXPENSES_PAYABLE;
    default:
      return resolveDefaultCashAccountCode();
  }
}

export const CASH_BANK_TYPE_TO_ACCOUNT_CODE: Record<CashBankAccountType, string> = {
  CASH: ACCOUNT_CODES.CASH_IN_HAND,
  BANK: ACCOUNT_CODES.BANK_ACCOUNTS,
  PAYMENT_GATEWAY: ACCOUNT_CODES.PAYMENT_GATEWAY_RECEIVABLE,
};

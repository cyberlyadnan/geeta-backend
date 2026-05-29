import { z } from 'zod';
import { WalletTransactionType } from '@prisma/client';
import { walletConfig } from '../../config/wallet.js';

export const addMoneySchema = z.object({
  amount: z.coerce
    .number()
    .min(walletConfig.minRechargeAmount)
    .max(walletConfig.maxRechargeAmount),
});

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  type: z.nativeEnum(WalletTransactionType).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export type AddMoneyInput = z.infer<typeof addMoneySchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

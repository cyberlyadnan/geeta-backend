import { z } from 'zod';
import { walletConfig } from '../../config/wallet.js';

export const createPaymentSchema = z.object({
  amount: z.coerce
    .number()
    .min(walletConfig.minRechargeAmount, `Minimum amount is ₹${walletConfig.minRechargeAmount}`)
    .max(walletConfig.maxRechargeAmount, `Maximum amount is ₹${walletConfig.maxRechargeAmount}`),
});

export const paymentIdParamSchema = z.object({
  id: z.string().min(1),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

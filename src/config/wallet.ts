import { env } from './env.js';

export const walletConfig = {
  minRechargeAmount: env.WALLET_MIN_RECHARGE_AMOUNT,
  maxRechargeAmount: env.WALLET_MAX_RECHARGE_AMOUNT,
  paymentExpiryMinutes: env.WALLET_PAYMENT_EXPIRY_MINUTES,
  currency: 'INR' as const,
};

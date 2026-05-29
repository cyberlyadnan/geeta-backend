import Razorpay from 'razorpay';
import { env } from '../../config/env.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { getRazorpayKeyMode, isRazorpayConfigured } from './razorpay.errors.js';
import { logger } from '../../logs/logger.js';

let client: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (!isRazorpayConfigured(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET)) {
    throw ApiError.serviceUnavailable(
      'Razorpay is not configured. Set valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET from Razorpay Dashboard → API Keys.',
      'RAZORPAY_NOT_CONFIGURED',
    );
  }

  const keyMode = getRazorpayKeyMode(env.RAZORPAY_KEY_ID);

  if (env.NODE_ENV === 'production' && keyMode === 'test') {
    logger.warn('Razorpay TEST keys are configured in production — use LIVE keys (rzp_live_*)');
  }

  if (!client) {
    logger.info('Initializing Razorpay client', {
      keyMode,
      keyIdPrefix: `${env.RAZORPAY_KEY_ID!.slice(0, 16)}...`,
    });
    client = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID!,
      key_secret: env.RAZORPAY_KEY_SECRET!,
    });
  }

  return client;
}

export function getRazorpayWebhookSecret(): string {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw ApiError.serviceUnavailable(
      'Razorpay webhook secret is not configured. Set RAZORPAY_WEBHOOK_SECRET from Dashboard → Webhooks.',
      'RAZORPAY_WEBHOOK_NOT_CONFIGURED',
    );
  }
  return env.RAZORPAY_WEBHOOK_SECRET;
}

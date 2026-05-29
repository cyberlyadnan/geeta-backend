import Razorpay from 'razorpay';
import { env } from '../../config/env.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { isRazorpayConfigured } from './razorpay.errors.js';

let client: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (!isRazorpayConfigured(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET)) {
    throw ApiError.serviceUnavailable(
      'Razorpay is not configured. Set valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET from Razorpay Dashboard → API Keys (Test mode).',
      'RAZORPAY_NOT_CONFIGURED',
    );
  }
  if (!client) {
    client = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
}

export function getRazorpayWebhookSecret(): string {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw ApiError.serviceUnavailable(
      'Razorpay webhook secret is not configured.',
      'RAZORPAY_WEBHOOK_NOT_CONFIGURED',
    );
  }
  return env.RAZORPAY_WEBHOOK_SECRET;
}

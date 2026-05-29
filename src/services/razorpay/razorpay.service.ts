import { createHmac, timingSafeEqual } from 'node:crypto';
import { getRazorpayClient, getRazorpayWebhookSecret } from './razorpay.client.js';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  extractRazorpayError,
  getRazorpayKeyMode,
  isQrFeatureUnavailableError,
  mapRazorpayError,
} from './razorpay.errors.js';
import { paiseFromRupees } from '../../utils/money.js';
import { env } from '../../config/env.js';
import { logger } from '../../logs/logger.js';

export type WalletCheckoutMode = 'upi_qr';

export interface CreateWalletRechargeInput {
  amountRupees: number;
  referenceId: string;
  description: string;
  expiresAt: Date;
}

export interface CreateWalletRechargeResult {
  checkoutMode: WalletCheckoutMode;
  razorpayId: string;
  /** Razorpay-hosted QR image URL (short link to PNG — e.g. rzp.io/i/… or rzp.io/rzp/…). */
  qrImageUrl: string;
  referenceId: string;
  expiresAt: Date;
}

const RAZORPAY_MIN_EXPIRE_MS = 20 * 60 * 1000;
const RAZORPAY_MAX_EXPIRE_MS = 2 * 60 * 60 * 1000;

function razorpayExpiryUnix(requestedExpiresAt?: Date): { unix: number; expiresAt: Date } {
  const now = Date.now();
  const minClose = now + RAZORPAY_MIN_EXPIRE_MS;
  const requested = requestedExpiresAt?.getTime() ?? minClose;
  const closeMs = Math.min(Math.max(requested, minClose), now + RAZORPAY_MAX_EXPIRE_MS);
  return {
    unix: Math.floor(closeMs / 1000),
    expiresAt: new Date(closeMs),
  };
}

export class RazorpayService {
  /**
   * Creates a native UPI QR (single-use, fixed amount) via Razorpay QR Codes API.
   * POST https://api.razorpay.com/v1/payments/qr_codes
   */
  async createWalletRechargeCheckout(
    input: CreateWalletRechargeInput,
  ): Promise<CreateWalletRechargeResult> {
    const razorpay = getRazorpayClient();
    const amountPaise = paiseFromRupees(input.amountRupees);
    const { unix: closeBy, expiresAt } = razorpayExpiryUnix(input.expiresAt);
    const keyMode = getRazorpayKeyMode(env.RAZORPAY_KEY_ID);

    const payload = {
      type: 'upi_qr' as const,
      name: 'Geeta Print Wallet',
      usage: 'single_use' as const,
      fixed_amount: true,
      payment_amount: amountPaise,
      description: input.description.slice(0, 255),
      notes: {
        reference_id: input.referenceId,
        purpose: 'wallet_recharge',
      },
      close_by: closeBy,
    };

    logger.info('Creating Razorpay UPI QR', {
      keyMode,
      amountPaise,
      referenceId: input.referenceId,
      closeBy,
    });

    try {
      const qr = (await razorpay.qrCode.create(payload)) as {
        id: string;
        image_url: string;
        type?: string;
      };

      if (!qr.id || !qr.image_url) {
        logger.error('Razorpay QR response missing id or image_url', { qr });
        throw mapRazorpayError({
          statusCode: 502,
          error: { description: 'Razorpay did not return a valid UPI QR code (missing id or image_url)' },
        });
      }

      if (!isValidQrImageUrl(qr.image_url)) {
        logger.error('Razorpay returned unexpected image_url format', {
          qrId: qr.id,
          imageUrl: qr.image_url,
        });
        throw ApiError.serviceUnavailable(
          `Razorpay returned an unexpected QR URL format: ${qr.image_url}. Ensure UPI QR Codes are enabled on your ${keyMode} Razorpay account.`,
          'UPI_QR_INVALID_URL',
          { imageUrl: qr.image_url, qrId: qr.id },
        );
      }

      logger.info('Razorpay UPI QR created', {
        qrId: qr.id,
        imageUrl: qr.image_url,
        keyMode,
      });

      return {
        checkoutMode: 'upi_qr',
        razorpayId: qr.id,
        qrImageUrl: qr.image_url,
        referenceId: input.referenceId,
        expiresAt,
      };
    } catch (err) {
      if (err instanceof ApiError) throw err;

      const extracted = extractRazorpayError(err);
      logger.error('Razorpay UPI QR creation failed', {
        keyMode,
        referenceId: input.referenceId,
        ...extracted,
      });

      if (isQrFeatureUnavailableError(err)) {
        throw ApiError.serviceUnavailable(
          `UPI QR Codes API is not enabled on your Razorpay ${keyMode} account. Contact Razorpay support to activate "UPI QR" / QR Codes API. Dashboard: Payment Methods → UPI QR.`,
          'UPI_QR_NOT_ENABLED',
          extracted.raw,
        );
      }

      throw mapRazorpayError(err);
    }
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
    if (!signature) return false;

    const secret = getRazorpayWebhookSecret();
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expected = createHmac('sha256', secret).update(body).digest('hex');

    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(signature, 'hex');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      const expectedUtf8 = createHmac('sha256', secret).update(body).digest('hex');
      return expectedUtf8 === signature;
    }
  }
}

/**
 * Razorpay QR Codes API returns a short URL to the QR PNG (rzp.io/i/…, rzp.io/rzp/…, etc.).
 * These are NOT payment-link checkout pages — they serve image/png when used as img src.
 */
function isValidQrImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return parsed.hostname === 'rzp.io' || parsed.hostname.endsWith('.razorpay.com');
  } catch {
    return false;
  }
}

export const razorpayService = new RazorpayService();

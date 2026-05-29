import { createHmac, timingSafeEqual } from 'node:crypto';
import { getRazorpayClient, getRazorpayWebhookSecret } from './razorpay.client.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { isQrFeatureUnavailableError, mapRazorpayError } from './razorpay.errors.js';
import { paiseFromRupees } from '../../utils/money.js';

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
  /** Razorpay-hosted QR image URL — encodes native UPI payload (not a website link). */
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
   * Requires UPI QR to be enabled on your Razorpay account — contact Razorpay support if unavailable.
   */
  async createWalletRechargeCheckout(
    input: CreateWalletRechargeInput,
  ): Promise<CreateWalletRechargeResult> {
    const razorpay = getRazorpayClient();
    const amountPaise = paiseFromRupees(input.amountRupees);
    const { unix: closeBy, expiresAt } = razorpayExpiryUnix(input.expiresAt);

    try {
      const qr = (await razorpay.qrCode.create({
        type: 'upi_qr',
        name: 'Geeta Print Wallet',
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: amountPaise,
        description: input.description.slice(0, 255),
        notes: {
          reference_id: input.referenceId,
          purpose: 'wallet_recharge',
        },
        close_by: closeBy,
      })) as { id: string; image_url: string };

      if (!qr.id || !qr.image_url) {
        throw mapRazorpayError({
          statusCode: 502,
          error: { description: 'Razorpay did not return a valid UPI QR code' },
        });
      }

      if (isWebsitePaymentUrl(qr.image_url)) {
        throw ApiError.serviceUnavailable(
          'Razorpay returned a web link instead of a UPI QR. Enable UPI QR Codes on your Razorpay account (Dashboard → contact support / Payment Methods → UPI QR).',
          'UPI_QR_NOT_ENABLED',
        );
      }

      return {
        checkoutMode: 'upi_qr',
        razorpayId: qr.id,
        qrImageUrl: qr.image_url,
        referenceId: input.referenceId,
        expiresAt,
      };
    } catch (err) {
      if (isQrFeatureUnavailableError(err)) {
        throw ApiError.serviceUnavailable(
          'UPI QR Codes are not enabled on your Razorpay account. Ask Razorpay to activate "UPI QR" / QR Codes API (Test & Live mode). Payment links cannot be used as scan-and-pay UPI QR.',
          'UPI_QR_NOT_ENABLED',
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

/** Payment-link short URLs open a website — not valid for in-app UPI QR display. */
function isWebsitePaymentUrl(url: string): boolean {
  return /rzp\.io\/rzp\//i.test(url) || /razorpay\.com/i.test(url);
}

export const razorpayService = new RazorpayService();

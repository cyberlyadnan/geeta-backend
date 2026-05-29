import { ApiError } from '../../common/errors/ApiError.js';

interface RazorpayApiErrorShape {
  statusCode?: number;
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    field?: string;
  };
  message?: string;
}

export function mapRazorpayError(err: unknown): ApiError {
  const rzp = err as RazorpayApiErrorShape;
  const status = rzp.statusCode;
  const description =
    rzp.error?.description ?? rzp.error?.reason ?? rzp.message ?? 'Razorpay request failed';
  const code = rzp.error?.code;

  if (status === 401) {
    return ApiError.serviceUnavailable(
      'Razorpay authentication failed: Key ID and Secret do not match or are invalid. In Dashboard (Test Mode) go to API Keys → Generate Key, copy both values into backend/.env, restart the server, then run: npm run verify:razorpay',
      'RAZORPAY_AUTH_FAILED',
      { razorpayCode: code, razorpayDescription: description },
    );
  }

  if (status === 400) {
    return ApiError.badRequest(description, undefined);
  }

  if (status === 404) {
    return ApiError.notFound(description);
  }

  if (status && status >= 500) {
    return ApiError.serviceUnavailable(
      'Payment gateway is temporarily unavailable. Please try again shortly.',
      'RAZORPAY_UNAVAILABLE',
      { razorpayDescription: description },
    );
  }

  return ApiError.serviceUnavailable(
    description,
    code ?? 'RAZORPAY_ERROR',
    { statusCode: status },
  );
}

export function isQrFeatureUnavailableError(err: unknown): boolean {
  const rzp = err as RazorpayApiErrorShape;
  const description = (rzp.error?.description ?? rzp.message ?? '').toLowerCase();
  if (description.includes('url was not found')) return true;
  if (description.includes('not found on the server')) return true;
  if (rzp.statusCode === 404) return true;
  return false;
}

export function isRazorpayConfigured(keyId?: string, keySecret?: string): boolean {
  if (!keyId || !keySecret) return false;
  const placeholders = ['your_razorpay', 'rzp_test_xxx', 'changeme', '...'];
  const id = keyId.trim().toLowerCase();
  const secret = keySecret.trim();
  if (placeholders.some((p) => id.includes(p) || secret === p)) return false;
  return id.startsWith('rzp_test_') || id.startsWith('rzp_live_');
}

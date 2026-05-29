import { ApiError } from '../../common/errors/ApiError.js';
import { env } from '../../config/env.js';

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

export function getRazorpayKeyMode(keyId?: string): 'live' | 'test' | 'unknown' {
  const id = keyId?.trim() ?? '';
  if (id.startsWith('rzp_live_')) return 'live';
  if (id.startsWith('rzp_test_')) return 'test';
  return 'unknown';
}

export function extractRazorpayError(err: unknown): {
  status?: number;
  code?: string;
  description: string;
  raw: Record<string, unknown>;
} {
  const rzp = err as RazorpayApiErrorShape;
  const description =
    rzp.error?.description ??
    rzp.error?.reason ??
    rzp.message ??
    (err instanceof Error ? err.message : 'Razorpay request failed');

  return {
    status: rzp.statusCode,
    code: rzp.error?.code,
    description,
    raw: {
      statusCode: rzp.statusCode,
      code: rzp.error?.code,
      description: rzp.error?.description,
      reason: rzp.error?.reason,
      field: rzp.error?.field,
      message: rzp.message,
    },
  };
}

export function mapRazorpayError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  const { status, code, description, raw } = extractRazorpayError(err);
  const keyMode = getRazorpayKeyMode(env.RAZORPAY_KEY_ID);
  const details = {
    razorpayCode: code,
    razorpayDescription: description,
    razorpayStatus: status,
    razorpayKeyMode: keyMode,
    razorpayError: raw,
  };

  if (status === 401) {
    return ApiError.serviceUnavailable(
      `Razorpay authentication failed (${keyMode} mode): Key ID and Secret do not match or are invalid. In Razorpay Dashboard → API Keys (${keyMode === 'live' ? 'Live' : 'Test'} mode), regenerate both values, update backend/.env, restart the server, then run: npm run verify:razorpay`,
      'RAZORPAY_AUTH_FAILED',
      details,
    );
  }

  if (status === 400) {
    return ApiError.badRequest(`Razorpay: ${description}`, undefined);
  }

  if (status === 404) {
    return ApiError.notFound(`Razorpay: ${description}`);
  }

  if (status && status >= 500) {
    return ApiError.serviceUnavailable(
      `Razorpay gateway error (${status}): ${description}`,
      'RAZORPAY_UNAVAILABLE',
      details,
    );
  }

  return ApiError.serviceUnavailable(
    description,
    code ?? 'RAZORPAY_ERROR',
    details,
  );
}

export function isQrFeatureUnavailableError(err: unknown): boolean {
  if (err instanceof ApiError) return false;

  const { status, description } = extractRazorpayError(err);
  const lower = description.toLowerCase();
  if (lower.includes('url was not found')) return true;
  if (lower.includes('not found on the server')) return true;
  if (status === 404) return true;
  return false;
}

export function isRazorpayConfigured(keyId?: string, keySecret?: string): boolean {
  if (!keyId || !keySecret) return false;
  const placeholders = ['your_razorpay', 'rzp_test_xxx', 'changeme', '...', 'your_secret'];
  const id = keyId.trim().toLowerCase();
  const secret = keySecret.trim();
  if (placeholders.some((p) => id.includes(p) || secret === p)) return false;
  return id.startsWith('rzp_test_') || id.startsWith('rzp_live_');
}

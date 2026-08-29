import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';

export const helmetMiddleware = helmet();

const configuredOrigins = new Set(
  env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  if (configuredOrigins.has(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;

    // Production domains — allow www / apex / subdomains (vendor + production portals).
    if (hostname === 'geetaprinters.in' || hostname.endsWith('.geetaprinters.in')) {
      return true;
    }

    // Local dev hosts
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      callback(null, origin ?? true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'X-Request-ID',
    'X-Requested-With',
    // Channel partner "view as vendor" — see middleware/partner-view.ts.
    'X-Partner-View',
  ],
  exposedHeaders: ['X-Request-ID'],
  optionsSuccessStatus: 204,
  maxAge: 86_400,
});

/** Compress JSON/text responses above 1KB; skip webhooks and pre-compressed assets */
export const compressionMiddleware = compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.path.includes('/payments') && req.method === 'POST') return false;
    if (req.path.includes('/artwork/upload') || req.path.includes('/replace')) return false;
    if (req.path.includes('/admin/storage/upload')) return false;
    const type = res.getHeader('Content-Type');
    if (typeof type === 'string' && /image|video|audio|zip|gzip/.test(type)) return false;
    return compression.filter(req, res);
  },
});

function isArtworkUploadRequest(req: Request): boolean {
  const path = req.originalUrl.toLowerCase();
  return (
    req.method === 'POST' &&
    (path.includes('/artwork/upload') ||
      path.includes('/admin/storage/upload') ||
      (path.includes('/order-artwork/') && path.includes('/replace')))
  );
}

/**
 * Bearer tokens are opaque here — this middleware runs before authentication, so there is no
 * req.user yet. Hashing the token gives a stable per-session key without decoding or trusting
 * it: two sessions from one office IP get two buckets, and a forged token just gets its own
 * (equally limited) bucket rather than borrowing someone else's allowance.
 */
function rateLimitKey(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    return `t:${createHash('sha256').update(token).digest('base64url').slice(0, 32)}`;
  }
  return `ip:${req.ip ?? 'unknown'}`;
}

/**
 * General API limiter.
 *
 * Keyed per session rather than per IP. Previously everything from one address shared a single
 * bucket, so a production tablet polling every few seconds would exhaust the allowance and then
 * block *login* from the same office — the symptom being "Too many requests" on a fresh sign-in
 * while background traffic ran normally. Authenticated traffic is also metered separately from
 * anonymous traffic, since polling is expected and sign-in attempts are not.
 */
export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: (req) => {
    const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
    return hasBearer ? env.RATE_LIMIT_AUTH_MAX : env.RATE_LIMIT_MAX;
  },
  keyGenerator: rateLimitKey,
  skip: (req) => isArtworkUploadRequest(req) || isHealthCheck(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
});

/**
 * Sign-in and token refresh get their own bucket, keyed by IP.
 *
 * A user who cannot get in is completely blocked, so this must never be exhausted by ordinary
 * API traffic — separating it means the general limiter can be generous without putting the
 * front door at risk, and this one can stay tight without affecting normal use. Sized for real
 * humans: a wrong password a dozen times is plausible, hundreds is not.
 */
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_LOGIN_MAX,
  keyGenerator: (req) => `login:${req.ip ?? 'unknown'}`,
  // Only failed attempts count. A shared office IP signing several people in successfully
  // should not lock the next person out.
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  },
});

/** Liveness/readiness probes must never be throttled — a limiter can't be allowed to fail them. */
function isHealthCheck(req: Request): boolean {
  const path = req.path.toLowerCase();
  return path === '/health' || path === '/healthz' || path === '/ready';
}

/** Stricter limit for unauthenticated vendor document access (phone + file id). */
export const complianceFileAccessRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many document access attempts. Please try again later.',
  },
});

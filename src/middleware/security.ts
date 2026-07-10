import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
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
  optionsSuccessStatus: 204,
  maxAge: 86_400,
});

/** Compress JSON/text responses above 1KB; skip webhooks and pre-compressed assets */
export const compressionMiddleware = compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.path.includes('/payments') && req.method === 'POST') return false;
    if (req.path.includes('/artwork/upload') || req.path.includes('/replace')) return false;
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
      (path.includes('/order-artwork/') && path.includes('/replace')))
  );
}

export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: (req) => {
    const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
    return hasBearer ? env.RATE_LIMIT_AUTH_MAX : env.RATE_LIMIT_MAX;
  },
  skip: (req) => isArtworkUploadRequest(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
});

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

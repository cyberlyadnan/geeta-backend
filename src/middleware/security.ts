import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const helmetMiddleware = helmet();

export const corsMiddleware = cors({
  origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  credentials: true,
});

/** Compress JSON/text responses above 1KB; skip webhooks and pre-compressed assets */
export const compressionMiddleware = compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.path.includes('/payments') && req.method === 'POST') return false;
    const type = res.getHeader('Content-Type');
    if (typeof type === 'string' && /image|video|audio|zip|gzip/.test(type)) return false;
    return compression.filter(req, res);
  },
});

export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: (req) => {
    const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
    return hasBearer ? env.RATE_LIMIT_AUTH_MAX : env.RATE_LIMIT_MAX;
  },
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

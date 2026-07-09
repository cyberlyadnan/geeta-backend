import { z } from 'zod';
import { enforceMinDuration } from '../utils/time.js';

const jwtDuration = (defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .transform((value) => enforceMinDuration(value));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('Geeta Print ERP'),
  APP_URL: z.string().url().default('http://localhost:5000'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().default('/api'),
  API_VERSION: z.string().default('v1'),

  /** Supabase pooler (port 6543) — used by the app at runtime */
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((url) => !url.includes('[YOUR-PASSWORD]') && !url.includes('[PASSWORD]'), {
      message:
        'DATABASE_URL still contains a placeholder password. Set your real Supabase password in .env or .env.local',
    }),
  /** Supabase direct connection (port 5432) — used by Prisma migrations */
  DIRECT_URL: z
    .string()
    .min(1, 'DIRECT_URL is required for Supabase (direct connection, not the pooler URL)')
    .optional(),

  /** Set to false to disable Redis entirely */
  REDIS_ENABLED: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === undefined || v === 'true' || v === '1'),
  /** Set to true to start API even when Redis is down (defaults to true in development) */
  REDIS_OPTIONAL: z.enum(['true', 'false', '1', '0']).optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: jwtDuration('1d'),
  JWT_REFRESH_EXPIRES_IN: jwtDuration('7d'),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
  LOG_DIR: z.string().default('logs'),

  BULLMQ_PREFIX: z.string().default('geeta-print'),

  SOCKET_CORS_ORIGIN: z.string().default('http://localhost:3000'),

  /** Cloudflare R2 (S3-compatible) — required for media uploads */
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  /** Public base URL for objects (custom domain or R2 public bucket URL) */
  R2_PUBLIC_URL: z.string().url().optional(),
  /** Defaults to https://<accountId>.r2.cloudflarestorage.com */
  R2_ENDPOINT: z.string().url().optional(),

  RAZORPAY_KEY_ID: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),
  RAZORPAY_KEY_SECRET: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),
  RAZORPAY_WEBHOOK_SECRET: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),

  WALLET_MIN_RECHARGE_AMOUNT: z.coerce.number().positive().default(100),
  WALLET_MAX_RECHARGE_AMOUNT: z.coerce.number().positive().default(100_000),
  WALLET_PAYMENT_EXPIRY_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(30)
    .transform((v) => Math.max(v, 20)),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    console.error('Invalid environment configuration:', formatted);
    throw new Error('Environment validation failed');
  }

  return result.data;
}

export const env = parseEnv();

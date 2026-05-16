import { z } from 'zod';

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
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
  LOG_DIR: z.string().default('logs'),

  BULLMQ_PREFIX: z.string().default('geeta-print'),

  SOCKET_CORS_ORIGIN: z.string().default('http://localhost:3000'),
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

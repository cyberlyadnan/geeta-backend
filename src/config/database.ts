import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from '../logs/logger.js';
import {
  isDirectSupabaseUrl,
  isSessionPoolerUrl,
  isTransactionPoolerUrl,
  resolveRuntimeDatabaseUrl,
} from './database-url.js';
import { prismaPerformanceExtension } from '../observability/prisma-performance.extension.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const configuredUrl = env.DATABASE_URL;
export const runtimeDatabaseUrl = resolveRuntimeDatabaseUrl(configuredUrl);

function createPrismaClient(): PrismaClient {
  const base = new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: {
      db: { url: runtimeDatabaseUrl },
    },
  });

  const extended = base.$extends(prismaPerformanceExtension());
  // Cast preserves TransactionClient typing across the codebase
  return extended as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

function poolerHint(): string | undefined {
  if (isDirectSupabaseUrl(runtimeDatabaseUrl)) {
    return 'Using Supabase direct connection (db.*.supabase.co) — lowest latency for persistent APIs.';
  }
  if (isTransactionPoolerUrl(configuredUrl) && runtimeDatabaseUrl !== configuredUrl) {
    return 'Auto-switched DATABASE_URL from transaction pooler (6543) to session pooler (5432).';
  }
  if (isTransactionPoolerUrl(runtimeDatabaseUrl)) {
    return 'Transaction pooler (6543) adds BEGIN/COMMIT per query. Use port 5432 or DATABASE_USE_DIRECT=true.';
  }
  if (isSessionPoolerUrl(runtimeDatabaseUrl)) {
    return 'Using Supabase session pooler (5432) — recommended for persistent Express APIs.';
  }
  return undefined;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    const hint = poolerHint();
    logger.info('PostgreSQL connected via Prisma', {
      configuredPort: configuredUrl.includes(':6543') ? 6543 : 5432,
      runtimePort: runtimeDatabaseUrl.includes(':6543') ? 6543 : 5432,
      autoSessionPooler: configuredUrl !== runtimeDatabaseUrl,
      ...(hint && { performanceHint: hint }),
    });
    if (isTransactionPoolerUrl(runtimeDatabaseUrl)) {
      logger.warn('Database latency: transaction pooler in use', { hint });
    }
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to connect to PostgreSQL', { message });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('PostgreSQL disconnected');
}

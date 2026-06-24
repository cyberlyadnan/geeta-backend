import { Prisma, PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from '../logs/logger.js';
import { prismaPerformanceService } from '../observability/prisma-performance.service.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Prisma options tuned for Supabase PgBouncer (transaction pooler) */
const isSupabasePooler =
  env.DATABASE_URL.includes('pooler.supabase.com') ||
  env.DATABASE_URL.includes('pgbouncer=true');

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [{ emit: 'event', level: 'query' }, 'error', 'warn'],
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  });

prismaPerformanceService.init(prisma);

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

function formatPrismaConnectionError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('PostgreSQL connected via Prisma', {
      mode: isSupabasePooler ? 'supabase-pooler' : 'direct',
    });
  } catch (error) {
    const message = formatPrismaConnectionError(error);

    logger.error('Failed to connect to PostgreSQL', {
      message,
      hint:
        message.includes('P1000') || message.toLowerCase().includes('authentication')
          ? 'Check DATABASE_URL password in .env / .env.local (replace [YOUR-PASSWORD] with your Supabase database password)'
          : message.includes('Can\'t reach')
            ? 'Check network, Supabase project status, and that DATABASE_URL host/port are correct'
            : undefined,
    });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('PostgreSQL disconnected');
}

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { performanceLogger } from '../logs/performance-logger.js';
import { logger } from '../logs/logger.js';
import {
  addDatabaseTime,
  addQuery,
  getRequestContext,
} from './request-context.js';
import { metricsStore } from './metrics-store.js';
import { normalizePrismaQuery, roundMs } from './utils.js';

const SLOW_QUERY_MS = Number(process.env['OBSERVABILITY_SLOW_QUERY_MS'] ?? 100);

function recordQueryEvent(input: {
  label: string;
  durationMs: number;
  params?: string;
  error?: string;
}): void {
  const ctx = getRequestContext();
  const normalizedQuery = normalizePrismaQuery(input.label);
  const requestId = ctx?.requestId;

  const entry = {
    id: randomUUID(),
    query: input.label,
    normalizedQuery,
    durationMs: input.durationMs,
    params: input.params ?? '[]',
    timestamp: new Date().toISOString(),
    requestId,
    error: input.error,
  };

  addDatabaseTime(input.durationMs);
  addQuery(entry);
  metricsStore.recordQuery(entry);

  if (ctx) {
    const count = (ctx.queryPatterns.get(normalizedQuery) ?? 0) + 1;
    if (
      count >= metricsStore.getNPlusOneThreshold() &&
      !ctx.nPlusOneReported.has(normalizedQuery)
    ) {
      ctx.nPlusOneReported.add(normalizedQuery);
      metricsStore.recordNPlusOne({
        requestId: ctx.requestId,
        pattern: normalizedQuery.slice(0, 200),
        count,
        timestamp: new Date().toISOString(),
        route: ctx.route,
      });
      performanceLogger.warn('N+1 query pattern detected', {
        requestId: ctx.requestId,
        route: ctx.route,
        pattern: normalizedQuery.slice(0, 200),
        count,
      });
    }
  }

  if (input.durationMs >= SLOW_QUERY_MS) {
    performanceLogger.warn('SLOW QUERY DETECTED', {
      requestId,
      durationMs: input.durationMs,
      query: input.label.slice(0, 500),
      params: input.params,
    });
  }

  logger.debug('Prisma query', {
    requestId,
    durationMs: input.durationMs,
    query: input.label.slice(0, 200),
  });
}

/** Prisma Client extension — times queries in the same async context as route handlers */
export function prismaPerformanceExtension() {
  return Prisma.defineExtension({
    name: 'geeta-performance',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const start = performance.now();
          const label = `${model}.${operation}`;
          try {
            const result = await query(args);
            recordQueryEvent({
              label,
              durationMs: roundMs(performance.now() - start),
              params: JSON.stringify(args).slice(0, 500),
            });
            return result;
          } catch (error) {
            recordQueryEvent({
              label,
              durationMs: roundMs(performance.now() - start),
              params: JSON.stringify(args).slice(0, 500),
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        },
      },
    },
  });
}

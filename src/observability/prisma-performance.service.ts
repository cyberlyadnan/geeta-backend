import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
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

type QueryCapablePrisma = PrismaClient & {
  $on(event: 'query', callback: (event: Prisma.QueryEvent) => void): PrismaClient;
};

let initialized = false;

export function initPrismaPerformanceMonitoring(prisma: PrismaClient): void {
  if (initialized) return;
  initialized = true;

  (prisma as QueryCapablePrisma).$on('query', (event) => {
    const durationMs = roundMs(event.duration);
    const normalizedQuery = normalizePrismaQuery(event.query);
    const requestId = getRequestContext()?.requestId;

    const entry = {
      id: randomUUID(),
      query: event.query,
      normalizedQuery,
      durationMs,
      params: event.params,
      timestamp: new Date().toISOString(),
      requestId,
    };

    addDatabaseTime(durationMs);
    addQuery(entry);
    metricsStore.recordQuery(entry);

    const ctx = getRequestContext();
    if (ctx) {
      const count = ctx.queryPatterns.get(normalizedQuery) ?? 0;
      if (count >= metricsStore.getNPlusOneThreshold() && !ctx.nPlusOneReported.has(normalizedQuery)) {
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

    if (durationMs >= SLOW_QUERY_MS) {
      performanceLogger.warn('SLOW QUERY DETECTED', {
        requestId,
        durationMs,
        query: event.query.slice(0, 500),
        params: event.params,
      });
    }

    logger.debug('Prisma query', {
      requestId,
      durationMs,
      query: event.query.slice(0, 200),
    });
  });
}

export const prismaPerformanceService = {
  init: initPrismaPerformanceMonitoring,
};

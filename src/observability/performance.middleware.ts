import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { performanceLogger } from '../logs/performance-logger.js';
import { logger } from '../logs/logger.js';
import {
  getPhaseTimings,
  getRequestContext,
  runWithRequestContext,
} from './request-context.js';
import { buildRouteLabel, metricsStore } from './metrics-store.js';
import { normalizeRoutePath, roundMs } from './utils.js';

export function performanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  res.setHeader('X-Request-ID', requestId);

  const startHrTime = performance.now();
  const startTime = new Date().toISOString();
  const url = req.originalUrl ?? req.url;
  const route = normalizeRoutePath(url.split('?')[0] ?? url);

  const ctx = {
    requestId,
    method: req.method,
    url,
    route,
    startTime,
    startHrTime,
    validationMs: 0,
    databaseMs: 0,
    queries: [],
    queryPatterns: new Map<string, number>(),
    nPlusOneReported: new Set<string>(),
  };

  runWithRequestContext(ctx, () => {
    res.on('finish', () => {
      const durationMs = roundMs(performance.now() - startHrTime);
      const endTime = new Date().toISOString();
      const userId = req.user?.id ?? getRequestContext()?.userId;
      const phases = getPhaseTimings(durationMs);
      const routeLabel = buildRouteLabel(req.method, url);

      const entry = {
        requestId,
        method: req.method,
        url,
        route: routeLabel,
        statusCode: res.statusCode,
        startTime,
        endTime,
        durationMs,
        userId,
        phases,
      };

      metricsStore.recordRequest(entry);

      performanceLogger.info('request_completed', entry);
      logger.debug('HTTP request', {
        requestId,
        method: req.method,
        url,
        statusCode: res.statusCode,
        durationMs,
        userId,
      });

      const threshold = metricsStore.getSlowApiThreshold();
      if (durationMs >= threshold) {
        const slowEntry = { ...entry, thresholdMs: threshold };
        metricsStore.recordSlowRequest(slowEntry);

        performanceLogger.warn('SLOW API DETECTED', {
          requestId,
          method: req.method,
          url,
          route: routeLabel,
          durationMs,
          thresholdMs: threshold,
          statusCode: res.statusCode,
          userId,
          phases,
          queryCount: getRequestContext()?.queries.length ?? 0,
        });
      }
    });

    next();
  });
}

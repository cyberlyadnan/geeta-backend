import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { performanceLogger } from '../logs/performance-logger.js';
import { logger } from '../logs/logger.js';
import {
  beginResponse,
  bindRequestContext,
  endResponse,
  getCacheStats,
  getPhaseTimings,
  getRequestContext,
} from './request-context.js';
import { buildRouteLabel, metricsStore } from './metrics-store.js';
import { logRequestBreakdown } from './request-breakdown.js';
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
    authenticationMs: 0,
    databaseMs: 0,
    responseMs: 0,
    queries: [],
    queryPatterns: new Map<string, number>(),
    nPlusOneReported: new Set<string>(),
    operations: [],
    cacheStats: { requestHits: 0, requestMisses: 0, redisHits: 0, redisMisses: 0 },
  };

  bindRequestContext(req, ctx);

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = ((body: unknown) => {
    beginResponse(req);
    const result = originalJson(body);
    endResponse(req);
    return result;
  }) as Response['json'];

  res.send = ((body: unknown) => {
    beginResponse(req);
    const result = originalSend(body);
    endResponse(req);
    return result;
  }) as Response['send'];

  res.on('finish', () => {
    const durationMs = roundMs(performance.now() - startHrTime);
    const endTime = new Date().toISOString();
    const activeCtx = getRequestContext(req);
    const userId = req.user?.id ?? activeCtx?.userId;
    const phases = getPhaseTimings(durationMs, req);
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

    performanceLogger.info('request_completed', {
      ...entry,
      queryCount: activeCtx?.queries.length ?? 0,
      cache: getCacheStats(req),
    });

    const breakdownEnabled =
      process.env['OBSERVABILITY_REQUEST_BREAKDOWN'] !== 'false' &&
      (durationMs >= 50 || (activeCtx?.queries.length ?? 0) > 0);
    if (breakdownEnabled) {
      logRequestBreakdown({
        req,
        method: req.method,
        route: routeLabel,
        durationMs,
        phases,
        statusCode: res.statusCode,
      });
    }

    logger.debug('HTTP request', {
      requestId,
      method: req.method,
      url,
      statusCode: res.statusCode,
      durationMs,
      userId,
      databaseMs: phases.databaseMs,
      queryCount: activeCtx?.queries.length ?? 0,
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
        queryCount: activeCtx?.queries.length ?? 0,
        topQueries: (activeCtx?.queries ?? [])
          .sort((a, b) => b.durationMs - a.durationMs)
          .slice(0, 5)
          .map((q) => ({ durationMs: q.durationMs, query: q.query.slice(0, 120) })),
      });
    }
  });

  next();
}

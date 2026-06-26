import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request } from 'express';
import type { PrismaQueryEntry, RequestOperationTiming, RequestPhaseTimings } from './types.js';
import type { RequestCache } from '../common/cache/request-cache.js';

export interface RequestCacheMetrics {
  requestHits: number;
  requestMisses: number;
  redisHits: number;
  redisMisses: number;
  repositoryMs: number;
  redisMs: number;
}

export interface ActiveRequestContext {
  requestId: string;
  method: string;
  url: string;
  route: string;
  startTime: string;
  startHrTime: number;
  userId?: string;
  validationStartHr?: number;
  validationMs: number;
  authenticationStartHr?: number;
  authenticationMs: number;
  databaseMs: number;
  responseStartHr?: number;
  responseMs: number;
  queries: PrismaQueryEntry[];
  queryPatterns: Map<string, number>;
  nPlusOneReported: Set<string>;
  operations: RequestOperationTiming[];
  requestCache?: RequestCache;
  cacheStats: RequestCacheMetrics;
  /** Loaded once per request — vendor profile for authenticated vendor */
  vendorProfileId?: string;
}

const storage = new AsyncLocalStorage<ActiveRequestContext>();

export function bindRequestContext(req: Request, ctx: ActiveRequestContext): void {
  req.performanceContext = ctx;
  storage.enterWith(ctx);
}

export function getRequestContext(req?: Request): ActiveRequestContext | undefined {
  return req?.performanceContext ?? storage.getStore();
}

export function runWithRequestContext<T>(ctx: ActiveRequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function runWithRequestFromReq<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  const ctx = req.performanceContext;
  if (!ctx) return fn();
  return storage.run(ctx, async () => fn());
}

export function setRequestUserId(userId: string, req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.userId = userId;
}

export function setRequestVendorProfileId(vendorProfileId: string, req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.vendorProfileId = vendorProfileId;
}

export function recordOperation(
  label: string,
  durationMs: number,
  category: RequestOperationTiming['category'],
  req?: Request,
): void {
  const ctx = getRequestContext(req);
  if (!ctx) return;
  ctx.operations.push({
    label,
    durationMs: Math.round(durationMs * 100) / 100,
    category,
  });
}

export function beginValidation(req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.validationStartHr = performance.now();
}

export function endValidation(req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx?.validationStartHr !== undefined) {
    const ms = performance.now() - ctx.validationStartHr;
    ctx.validationMs += ms;
    recordOperation('Request validation', ms, 'validation', req);
    ctx.validationStartHr = undefined;
  }
}

export function beginAuthentication(req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.authenticationStartHr = performance.now();
}

export function endAuthentication(req?: Request, label = 'JWT verification'): void {
  const ctx = getRequestContext(req);
  if (ctx?.authenticationStartHr !== undefined) {
    const ms = performance.now() - ctx.authenticationStartHr;
    ctx.authenticationMs += ms;
    recordOperation(label, ms, 'auth', req);
    ctx.authenticationStartHr = undefined;
  }
}

export function beginResponse(req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.responseStartHr = performance.now();
}

export function endResponse(req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx?.responseStartHr !== undefined) {
    const ms = performance.now() - ctx.responseStartHr;
    ctx.responseMs += ms;
    recordOperation('Response serialization', ms, 'serialization', req);
    ctx.responseStartHr = undefined;
  }
}

export function addDatabaseTime(ms: number, req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.databaseMs += ms;
}

export function addQuery(entry: PrismaQueryEntry, req?: Request): void {
  const ctx = getRequestContext(req);
  if (!ctx) return;
  ctx.queries.push(entry);
  const count = (ctx.queryPatterns.get(entry.normalizedQuery) ?? 0) + 1;
  ctx.queryPatterns.set(entry.normalizedQuery, count);
}

export function getPhaseTimings(totalMs: number, req?: Request): RequestPhaseTimings {
  const ctx = getRequestContext(req);
  const validationMs = ctx?.validationMs ?? 0;
  const authenticationMs = ctx?.authenticationMs ?? 0;
  const databaseMs = ctx?.databaseMs ?? 0;
  const responseMs = ctx?.responseMs ?? 0;
  const businessLogicMs = Math.max(
    0,
    totalMs - validationMs - authenticationMs - databaseMs - responseMs,
  );

  return {
    validationMs: Math.round(validationMs * 100) / 100,
    authenticationMs: Math.round(authenticationMs * 100) / 100,
    businessLogicMs: Math.round(businessLogicMs * 100) / 100,
    databaseMs: Math.round(databaseMs * 100) / 100,
    responseMs: Math.round(responseMs * 100) / 100,
  };
}

export function getCacheStats(req?: Request): RequestCacheMetrics {
  const ctx = getRequestContext(req);
  return (
    ctx?.cacheStats ?? {
      requestHits: 0,
      requestMisses: 0,
      redisHits: 0,
      redisMisses: 0,
      repositoryMs: 0,
      redisMs: 0,
    }
  );
}

export function addRepositoryTime(ms: number, req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.cacheStats.repositoryMs += ms;
}

export function addRedisTime(ms: number, req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.cacheStats.redisMs += ms;
}

export function getRequestOperations(req?: Request): RequestOperationTiming[] {
  const ctx = getRequestContext(req);
  if (!ctx) return [];
  const dbOps: RequestOperationTiming[] = ctx.queries.map((q) => ({
    label: q.query,
    durationMs: q.durationMs,
    category: 'database' as const,
  }));
  return [...ctx.operations, ...dbOps];
}

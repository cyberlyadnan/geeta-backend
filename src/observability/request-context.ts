import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request } from 'express';
import type { PrismaQueryEntry, RequestPhaseTimings } from './types.js';

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
  databaseMs: number;
  responseStartHr?: number;
  responseMs: number;
  queries: PrismaQueryEntry[];
  queryPatterns: Map<string, number>;
  nPlusOneReported: Set<string>;
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

export function beginValidation(req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.validationStartHr = performance.now();
}

export function endValidation(req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx?.validationStartHr !== undefined) {
    ctx.validationMs += performance.now() - ctx.validationStartHr;
    ctx.validationStartHr = undefined;
  }
}

export function beginResponse(req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.responseStartHr = performance.now();
}

export function endResponse(req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx?.responseStartHr !== undefined) {
    ctx.responseMs += performance.now() - ctx.responseStartHr;
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
  const databaseMs = ctx?.databaseMs ?? 0;
  const responseMs = ctx?.responseMs ?? 0;
  const businessLogicMs = Math.max(0, totalMs - validationMs - databaseMs - responseMs);

  return {
    validationMs: Math.round(validationMs * 100) / 100,
    businessLogicMs: Math.round(businessLogicMs * 100) / 100,
    databaseMs: Math.round(databaseMs * 100) / 100,
    responseMs: Math.round(responseMs * 100) / 100,
  };
}

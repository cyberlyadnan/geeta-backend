import { AsyncLocalStorage } from 'node:async_hooks';
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
  queries: PrismaQueryEntry[];
  queryPatterns: Map<string, number>;
  nPlusOneReported: Set<string>;
}

const storage = new AsyncLocalStorage<ActiveRequestContext>();

export function runWithRequestContext<T>(ctx: ActiveRequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): ActiveRequestContext | undefined {
  return storage.getStore();
}

export function setRequestUserId(userId: string): void {
  const ctx = storage.getStore();
  if (ctx) ctx.userId = userId;
}

export function beginValidation(): void {
  const ctx = storage.getStore();
  if (ctx) ctx.validationStartHr = performance.now();
}

export function endValidation(): void {
  const ctx = storage.getStore();
  if (ctx?.validationStartHr !== undefined) {
    ctx.validationMs += performance.now() - ctx.validationStartHr;
    ctx.validationStartHr = undefined;
  }
}

export function addDatabaseTime(ms: number): void {
  const ctx = storage.getStore();
  if (ctx) ctx.databaseMs += ms;
}

export function addQuery(entry: PrismaQueryEntry): void {
  const ctx = storage.getStore();
  if (!ctx) return;
  ctx.queries.push(entry);
  const count = (ctx.queryPatterns.get(entry.normalizedQuery) ?? 0) + 1;
  ctx.queryPatterns.set(entry.normalizedQuery, count);
}

export function getPhaseTimings(totalMs: number): RequestPhaseTimings {
  const ctx = storage.getStore();
  const validationMs = ctx?.validationMs ?? 0;
  const databaseMs = ctx?.databaseMs ?? 0;
  const responseMs = Math.max(0, totalMs - validationMs - databaseMs) * 0.05;
  const businessLogicMs = Math.max(
    0,
    totalMs - validationMs - databaseMs - responseMs,
  );

  return {
    validationMs: Math.round(validationMs * 100) / 100,
    businessLogicMs: Math.round(businessLogicMs * 100) / 100,
    databaseMs: Math.round(databaseMs * 100) / 100,
    responseMs: Math.round(responseMs * 100) / 100,
  };
}

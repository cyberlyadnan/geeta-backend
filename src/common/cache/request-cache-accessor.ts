import type { Request } from 'express';
import { RequestCache } from './request-cache.js';
import { getRequestContext } from '../../observability/request-context.js';

export interface RequestCacheStats {
  requestHits: number;
  requestMisses: number;
}

export function getRequestCache(req?: Request): RequestCache {
  const ctx = getRequestContext(req);
  if (!ctx) return new RequestCache();
  if (!ctx.requestCache) {
    ctx.requestCache = new RequestCache();
  }
  return ctx.requestCache;
}

export function recordRequestCacheHit(req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.cacheStats.requestHits += 1;
}

export function recordRequestCacheMiss(req?: Request): void {
  const ctx = getRequestContext(req);
  if (ctx) ctx.cacheStats.requestMisses += 1;
}

/** Load once per request — deduplicates concurrent identical loads */
export async function loadOncePerRequest<T>(
  key: string,
  loader: () => Promise<T>,
  req?: Request,
): Promise<T> {
  const cache = getRequestCache(req);
  if (cache.has(key)) {
    recordRequestCacheHit(req);
  } else {
    recordRequestCacheMiss(req);
  }
  return cache.getOrLoad(key, loader);
}

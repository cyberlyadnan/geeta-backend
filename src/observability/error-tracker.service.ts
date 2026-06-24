import type { ErrorCategory } from './types.js';
import { metricsStore } from './metrics-store.js';
import { getRequestContext } from './request-context.js';
import { logger } from '../logs/logger.js';

export function trackError(input: {
  category: ErrorCategory;
  message: string;
  stack?: string;
  statusCode?: number;
  path?: string;
  method?: string;
  userId?: string;
}): void {
  const ctx = getRequestContext();
  const entry = metricsStore.recordError({
    ...input,
    requestId: ctx?.requestId,
    userId: input.userId ?? ctx?.userId,
    path: input.path ?? ctx?.url,
    method: input.method ?? ctx?.method,
  });

  logger.error('Tracked error', {
    category: entry.category,
    message: entry.message,
    requestId: entry.requestId,
    statusCode: entry.statusCode,
  });
}

export const errorTracker = { track: trackError };

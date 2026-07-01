export const QUEUE_CACHE_PREFIX = 'production-queue:';
export const QUEUE_DEPARTMENTS_CACHE_KEY = `${QUEUE_CACHE_PREFIX}departments:v1`;
export const QUEUE_DEPARTMENTS_TTL_SEC = 30;
export const QUEUE_LIST_TTL_SEC = 15;

export const RUSH_PRIORITIES = ['URGENT', 'HIGH'] as const;

export const QUEUE_PERMISSIONS = {
  VIEW: 'production.queue.view',
  VIEW_ALL: 'production.queue.view.all',
  dept: (code: string) => `production.queue.dept:${code}`,
} as const;

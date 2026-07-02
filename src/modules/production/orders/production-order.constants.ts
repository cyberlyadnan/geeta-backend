export const PRODUCTION_ORDER_CACHE_PREFIX = 'production-orders:';
export const PRODUCTION_ORDER_LIST_TTL_SEC = 30;
export const PRODUCTION_ORDER_DETAIL_TTL_SEC = 45;

export const PRODUCTION_ORDER_PERMISSIONS = {
  VIEW: 'production.order.view',
  VIEW_ALL: 'production.order.view.all',
  MANAGE: 'production.order.manage',
  ALL: 'production.order:*',
} as const;

export const RUSH_PRIORITIES = ['URGENT', 'HIGH'] as const;

export const ACTIVE_TASK_STATUSES = [
  'READY',
  'ASSIGNED',
  'IN_PROGRESS',
  'ON_HOLD',
  'PAUSED',
  'BLOCKED',
  'REWORK',
  'REJECTED',
] as const;

export const TERMINAL_TASK_STATUSES = ['COMPLETED', 'CANCELLED', 'SKIPPED'] as const;

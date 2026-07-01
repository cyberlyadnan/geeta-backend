export const CONTROL_CENTER_CACHE_PREFIX = 'production-control:';
export const CONTROL_CENTER_DASHBOARD_KEY = `${CONTROL_CENTER_CACHE_PREFIX}dashboard:v1`;
export const CONTROL_CENTER_TIMELINE_KEY = `${CONTROL_CENTER_CACHE_PREFIX}timeline:v1`;
export const CONTROL_CENTER_ALERTS_KEY = `${CONTROL_CENTER_CACHE_PREFIX}alerts:v1`;

export const CONTROL_CENTER_DASHBOARD_TTL_SEC = 20;
export const CONTROL_CENTER_TIMELINE_TTL_SEC = 10;
export const CONTROL_CENTER_ALERTS_TTL_SEC = 15;

export const CONTROL_CENTER_PERMISSIONS = {
  VIEW: 'production.control.view',
  ALL: 'production.control:*',
} as const;

export const TIMELINE_FEED_EVENT_TYPES = [
  'TASK_STARTED',
  'TASK_COMPLETED',
  'QC_STARTED',
  'QC_PASSED',
  'QC_FAILED',
  'QC_HELD',
  'WORKFLOW_REWORKED',
  'TASK_HELD',
  'SUPERVISOR_REQUESTED',
  'TASK_ASSIGNED',
  'TASK_REASSIGNED',
  'TASK_UNASSIGNED',
  'ASSIGNMENT_CREATED',
] as const;

export const HEATMAP_THRESHOLDS = {
  yellowWorkload: 12,
  redWorkload: 25,
  yellowDelayed: 2,
  redDelayed: 5,
} as const;

export type HeatmapLevel = 'GREEN' | 'YELLOW' | 'RED';

export const TERMINAL_TASK_STATUSES = ['COMPLETED', 'CANCELLED', 'SKIPPED'] as const;

export const ACTIVE_INSTANCE_STATUSES = ['RUNNING', 'IN_PROGRESS', 'INITIALIZED'] as const;

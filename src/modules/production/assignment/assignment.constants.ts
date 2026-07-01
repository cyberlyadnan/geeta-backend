export const ASSIGNMENT_PERMISSIONS = {
  ASSIGN: 'production.task.assign',
  VIEW_OWN: 'production.task.view.own',
  VIEW_ALL: 'production.task.view.all',
} as const;

export const ASSIGNMENT_TIMELINE_EVENTS = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_REASSIGNED: 'TASK_REASSIGNED',
  TASK_UNASSIGNED: 'TASK_UNASSIGNED',
  TASK_PRIORITY_CHANGED: 'TASK_PRIORITY_CHANGED',
  TASK_DUE_DATE_CHANGED: 'TASK_DUE_DATE_CHANGED',
} as const;

export const ASSIGNMENT_CACHE_PREFIX = 'production-assignment:';
export const MY_TASKS_TTL_SEC = 15;

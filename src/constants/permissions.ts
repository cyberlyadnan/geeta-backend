export const PERMISSIONS = {
  USERS: {
    READ: 'users:read',
    CREATE: 'users:create',
    UPDATE: 'users:update',
    DELETE: 'users:delete',
    ALL: 'users:*',
  },
  ORDERS: {
    READ: 'orders:read',
    CREATE: 'orders:create',
    UPDATE: 'orders:update',
    DELETE: 'orders:delete',
    OWN: 'orders:own',
    ALL: 'orders:*',
  },
  WALLET: {
    READ: 'wallet:read',
    OWN: 'wallet:own',
    ALL: 'wallet:*',
  },
  WORKFLOW: {
    READ: 'workflow:read',
    UPDATE: 'workflow:update',
    ALL: 'workflow:*',
  },
  PRODUCTION_QUEUE: {
    VIEW: 'production.queue.view',
    VIEW_ALL: 'production.queue.view.all',
    ALL: 'production.queue:*',
    dept: (code: string) => `production.queue.dept:${code}`,
  },
  PRODUCTION_TASK: {
    ASSIGN: 'production.task.assign',
    EXECUTE: 'production.task.execute',
    VIEW_OWN: 'production.task.view.own',
    VIEW_ALL: 'production.task.view.all',
    ALL: 'production.task:*',
  },
  PRODUCTION_QC: {
    INSPECT: 'production.qc.inspect',
    VIEW_ALL: 'production.qc.view.all',
    ALL: 'production.qc:*',
  },
  PRODUCTION_CONTROL: {
    VIEW: 'production.control.view',
    ALL: 'production.control:*',
  },
  REPORTS: {
    READ: 'reports:read',
    ALL: 'reports:*',
  },
  PRODUCTS: {
    READ: 'products:read',
    ALL: 'products:*',
  },
  PURCHASES: {
    OWN: 'purchases:own',
    ALL: 'purchases:*',
  },
  SUPPORT: {
    OWN: 'support:own',
    ALL: 'support:*',
  },
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS]];

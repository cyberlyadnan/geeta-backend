export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  INVOICE_GENERATION: 'invoice-generation',
  SLA_MONITORING: 'sla-monitoring',
  EMAIL: 'email',
  REPORTS: 'reports',
  SLIDER_EXPIRY: 'slider-expiry',
  ACTIVITY_LOGS: 'activity-logs',
  ANALYTICS: 'analytics',
  ARTWORK_PROCESSING: 'artwork-processing',
  ACCOUNTING_PROJECTION: 'accounting-projection',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

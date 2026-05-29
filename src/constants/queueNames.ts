export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  INVOICE_GENERATION: 'invoice-generation',
  SLA_MONITORING: 'sla-monitoring',
  EMAIL: 'email',
  REPORTS: 'reports',
  SLIDER_EXPIRY: 'slider-expiry',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

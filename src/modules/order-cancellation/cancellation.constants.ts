export const CANCELLATION_EVENT_TYPES = {
  VENDOR_DIRECT_CANCEL: 'cancellation.vendor_direct_cancel',
  VENDOR_REQUESTED: 'cancellation.vendor_requested',
  MANAGER_OPENED: 'cancellation.manager_opened',
  MANAGER_APPROVED: 'cancellation.manager_approved',
  MANAGER_REJECTED: 'cancellation.manager_rejected',
  WORKFLOW_CANCELLED: 'cancellation.workflow_cancelled',
  NOTIFICATION_SENT: 'cancellation.notification_sent',
  ADMIN_OVERRIDE: 'cancellation.admin_override',
} as const;

export const CANCELLATION_NOTIFICATION_TYPES = {
  REQUEST_SUBMITTED: 'order_cancellation_requested',
  REQUEST_APPROVED: 'order_cancellation_approved',
  REQUEST_REJECTED: 'order_cancellation_rejected',
  ORDER_CANCELLED: 'order_cancelled',
  NEW_REQUEST_FOR_MANAGER: 'order_cancellation_new_request',
} as const;

export const CANCELLATION_ALLOWED_ACTION = {
  DIRECT_CANCEL: 'DIRECT_CANCEL',
  REQUEST_CANCELLATION: 'REQUEST_CANCELLATION',
  NOT_ALLOWED: 'NOT_ALLOWED',
  NONE: 'NONE',
} as const;

export type CancellationAllowedAction =
  (typeof CANCELLATION_ALLOWED_ACTION)[keyof typeof CANCELLATION_ALLOWED_ACTION];

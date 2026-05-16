export const SOCKET_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',

  // Client → Server
  JOIN_ROOM: 'join:room',
  LEAVE_ROOM: 'leave:room',

  // Server → Client
  ORDER_UPDATED: 'order:updated',
  ORDER_STATUS_CHANGED: 'order:status_changed',
  NOTIFICATION_NEW: 'notification:new',
  WORKFLOW_STEP_UPDATED: 'workflow:step_updated',
  WORKFLOW_SLA_WARNING: 'workflow:sla_warning',
} as const;

export const SOCKET_ROOMS = {
  user: (userId: string) => `user:${userId}`,
  order: (orderId: string) => `order:${orderId}`,
  workflow: (workflowId: string) => `workflow:${workflowId}`,
  role: (role: string) => `role:${role}`,
} as const;

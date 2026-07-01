import { EventEmitter } from 'node:events';
import { logger } from '../logs/logger.js';

export const APP_EVENTS = {
  ORDER_CREATED: 'order:created',
  ORDER_STATUS_CHANGED: 'order:status_changed',
  PAYMENT_RECEIVED: 'payment:received',
  WALLET_TRANSACTION: 'wallet:transaction',
  WORKFLOW_STEP_COMPLETED: 'workflow:step_completed',
  WORKFLOW_CREATED: 'workflow:created',
  WORKFLOW_COMPLETED: 'workflow:completed',
  WORKFLOW_CANCELLED: 'workflow:cancelled',
  TASK_CREATED: 'workflow:task_created',
  TASK_READY: 'workflow:task_ready',
  TASK_COMPLETED: 'workflow:task_completed',
  TASK_ACTIVATED: 'workflow:task_activated',
  TASK_ASSIGNED: 'workflow:task_assigned',
  TASK_REASSIGNED: 'workflow:task_reassigned',
  TASK_UNASSIGNED: 'workflow:task_unassigned',
  TASK_PRIORITY_CHANGED: 'workflow:task_priority_changed',
  TASK_DUE_DATE_CHANGED: 'workflow:task_due_date_changed',
  TASK_STARTED: 'workflow:task_started',
  TASK_PAUSED: 'workflow:task_paused',
  TASK_RESUMED: 'workflow:task_resumed',
  TASK_HELD: 'workflow:task_held',
  TASK_NOTE_ADDED: 'workflow:task_note_added',
  TASK_ATTACHMENT_ADDED: 'workflow:task_attachment_added',
  SUPERVISOR_REQUESTED: 'workflow:supervisor_requested',
  TASK_ISSUE_REPORTED: 'workflow:task_issue_reported',
  SUPPORT_TICKET_CREATED: 'support:ticket_created',
} as const;

export type AppEvent = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];

class AppEventBus extends EventEmitter {
  emitEvent<T>(event: AppEvent, payload: T): boolean {
    logger.debug('Event emitted', { event, payload });
    return this.emit(event, payload);
  }
}

export const eventBus = new AppEventBus();

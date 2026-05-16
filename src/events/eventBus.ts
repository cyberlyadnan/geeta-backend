import { EventEmitter } from 'node:events';
import { logger } from '../logs/logger.js';

export const APP_EVENTS = {
  ORDER_CREATED: 'order:created',
  ORDER_STATUS_CHANGED: 'order:status_changed',
  PAYMENT_RECEIVED: 'payment:received',
  WALLET_TRANSACTION: 'wallet:transaction',
  WORKFLOW_STEP_COMPLETED: 'workflow:step_completed',
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

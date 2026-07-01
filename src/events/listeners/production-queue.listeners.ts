import { eventBus, APP_EVENTS } from '../eventBus.js';
import { logger } from '../../logs/logger.js';
import { productionQueueCache } from '../../modules/production/queue/queue.cache.js';

export function registerProductionQueueListeners(): void {
  const invalidate = (event: string, payload: unknown) => {
    logger.debug('Invalidating production queue cache', { event, payload });
    void productionQueueCache.invalidateAll();
  };

  eventBus.on(APP_EVENTS.TASK_READY, (payload) => invalidate(APP_EVENTS.TASK_READY, payload));
  eventBus.on(APP_EVENTS.TASK_COMPLETED, (payload) =>
    invalidate(APP_EVENTS.TASK_COMPLETED, payload),
  );
  eventBus.on(APP_EVENTS.TASK_CREATED, (payload) => invalidate(APP_EVENTS.TASK_CREATED, payload));
  eventBus.on(APP_EVENTS.WORKFLOW_CREATED, (payload) =>
    invalidate(APP_EVENTS.WORKFLOW_CREATED, payload),
  );
  eventBus.on(APP_EVENTS.WORKFLOW_COMPLETED, (payload) =>
    invalidate(APP_EVENTS.WORKFLOW_COMPLETED, payload),
  );
  eventBus.on(APP_EVENTS.WORKFLOW_CANCELLED, (payload) =>
    invalidate(APP_EVENTS.WORKFLOW_CANCELLED, payload),
  );

  eventBus.on(APP_EVENTS.TASK_ASSIGNED, (payload) => invalidate(APP_EVENTS.TASK_ASSIGNED, payload));
  eventBus.on(APP_EVENTS.TASK_REASSIGNED, (payload) =>
    invalidate(APP_EVENTS.TASK_REASSIGNED, payload),
  );
  eventBus.on(APP_EVENTS.TASK_UNASSIGNED, (payload) =>
    invalidate(APP_EVENTS.TASK_UNASSIGNED, payload),
  );
}

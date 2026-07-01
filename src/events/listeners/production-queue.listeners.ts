import { eventBus, APP_EVENTS } from '../eventBus.js';
import { logger } from '../../logs/logger.js';
import { controlCenterCache } from '../../modules/production/control-center/control-center.cache.js';
import { productionQueueCache } from '../../modules/production/queue/queue.cache.js';
import { machineCache } from '../../modules/production/machines/machine.cache.js';
import { emitControlCenterUpdated } from '../../websocket/emitters/control-center.emitter.js';

export function registerProductionQueueListeners(): void {
  const invalidate = (event: string, payload: unknown) => {
    logger.debug('Invalidating production queue cache', { event, payload });
    void productionQueueCache.invalidateAll();
    void controlCenterCache.invalidateAll().then(() => {
      emitControlCenterUpdated({ refreshedAt: new Date().toISOString(), source: event });
    });
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

  eventBus.on(APP_EVENTS.TASK_STARTED, (payload) => invalidate(APP_EVENTS.TASK_STARTED, payload));
  eventBus.on(APP_EVENTS.TASK_PAUSED, (payload) => invalidate(APP_EVENTS.TASK_PAUSED, payload));
  eventBus.on(APP_EVENTS.TASK_RESUMED, (payload) => invalidate(APP_EVENTS.TASK_RESUMED, payload));
  eventBus.on(APP_EVENTS.TASK_HELD, (payload) => invalidate(APP_EVENTS.TASK_HELD, payload));

  eventBus.on(APP_EVENTS.QC_STARTED, (payload) => invalidate(APP_EVENTS.QC_STARTED, payload));
  eventBus.on(APP_EVENTS.QC_PASSED, (payload) => invalidate(APP_EVENTS.QC_PASSED, payload));
  eventBus.on(APP_EVENTS.QC_FAILED, (payload) => invalidate(APP_EVENTS.QC_FAILED, payload));
  eventBus.on(APP_EVENTS.QC_HOLD, (payload) => invalidate(APP_EVENTS.QC_HOLD, payload));
  eventBus.on(APP_EVENTS.REWORK_REQUESTED, (payload) =>
    invalidate(APP_EVENTS.REWORK_REQUESTED, payload),
  );
  eventBus.on(APP_EVENTS.SUPERVISOR_REQUESTED, (payload) =>
    invalidate(APP_EVENTS.SUPERVISOR_REQUESTED, payload),
  );
  eventBus.on(APP_EVENTS.TASK_ISSUE_REPORTED, (payload) =>
    invalidate(APP_EVENTS.TASK_ISSUE_REPORTED, payload),
  );

  const invalidateMachines = (event: string, payload: unknown) => {
    logger.debug('Invalidating machine cache', { event, payload });
    void machineCache.invalidateAll();
    invalidate(event, payload);
  };

  eventBus.on(APP_EVENTS.MACHINE_CREATED, (payload) =>
    invalidateMachines(APP_EVENTS.MACHINE_CREATED, payload),
  );
  eventBus.on(APP_EVENTS.MACHINE_UPDATED, (payload) =>
    invalidateMachines(APP_EVENTS.MACHINE_UPDATED, payload),
  );
  eventBus.on(APP_EVENTS.MACHINE_ASSIGNED, (payload) =>
    invalidateMachines(APP_EVENTS.MACHINE_ASSIGNED, payload),
  );
  eventBus.on(APP_EVENTS.MACHINE_STATUS_CHANGED, (payload) =>
    invalidateMachines(APP_EVENTS.MACHINE_STATUS_CHANGED, payload),
  );
  eventBus.on(APP_EVENTS.MACHINE_ARCHIVED, (payload) =>
    invalidateMachines(APP_EVENTS.MACHINE_ARCHIVED, payload),
  );
}

import { eventBus, APP_EVENTS } from '../eventBus.js';
import { logger } from '../../logs/logger.js';
import { dispatchReadinessService } from '../../modules/dispatch/dispatch-readiness.service.js';
import { dispatchService } from '../../modules/dispatch/dispatch.service.js';

/**
 * Books orders into dispatch batches as production finishes. Listener-based rather than inline
 * in the workflow engine so a dispatch failure can never roll back a completed production step —
 * the order stays completed and can be re-evaluated.
 */
export function registerDispatchListeners(): void {
  eventBus.on(APP_EVENTS.TASK_READY, (payload: { workflowInstanceId: string; taskId: string }) => {
    void dispatchReadinessService
      .onTaskReady(payload.taskId)
      .then((outcome) => {
        if (outcome.ready) {
          logger.info('Order booked into dispatch batch via task ready', {
            taskId: payload.taskId,
            batchId: outcome.batchId,
          });
        }
      })
      .catch((error: unknown) => {
        logger.error('Dispatch readiness task evaluation failed', {
          taskId: payload.taskId,
          error,
        });
      });
  });

  eventBus.on(APP_EVENTS.WORKFLOW_COMPLETED, (payload: { workflowInstanceId: string }) => {
    void dispatchReadinessService
      .onWorkflowCompleted(payload.workflowInstanceId)
      .then((outcome) => {
        if (outcome.ready) {
          logger.info('Order booked into dispatch batch', {
            workflowInstanceId: payload.workflowInstanceId,
            batchId: outcome.batchId,
          });
        }
      })
      .catch((error: unknown) => {
        logger.error('Dispatch readiness evaluation failed', {
          workflowInstanceId: payload.workflowInstanceId,
          error,
        });
      });
  });

  // Flow 3 — a top-up releases whatever the shortfall was blocking, without the dispatcher
  // re-entering the charge (it is still stored on the held batch).
  eventBus.on(APP_EVENTS.WALLET_TOPPED_UP, (payload: { userId: string }) => {
    void dispatchService
      .releaseHeldBatchesForVendor(payload.userId, payload.userId)
      .then(({ releasedBatchIds }) => {
        if (releasedBatchIds.length > 0) {
          logger.info('Wallet top-up released held dispatch batches', {
            userId: payload.userId,
            releasedBatchIds,
          });
        }
      })
      .catch((error: unknown) => {
        logger.error('Failed to release held dispatch batches after top-up', {
          userId: payload.userId,
          error,
        });
      });
  });
}

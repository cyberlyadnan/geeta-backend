import {
  ProductionOrderStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { recordOrderEvent } from '../orders/order-events.service.js';
import {
  hasOpenDispatchWork,
  isPreDispatchProductionComplete,
  isDispatchWorkflowStep,
} from '../workflow/workflow-dispatch.util.js';
import { shiftAssignmentService, type DispatchActor } from './shift-assignment.service.js';

/** Narrow slice of the Prisma client this service needs — injectable so tests can drive the
 *  whole flow with a hand-rolled fake instead of monkey-patching the real (proxy-based) Prisma
 *  client, which node:test's mock.method cannot patch (see retail-customer.service tests). */
export type DispatchReadinessDb = Pick<
  typeof prisma,
  'workflowInstance' | 'productionOrder' | 'workflowTask' | '$transaction'
>;

export interface ReadinessOutcome {
  ready: boolean;
  /** Why the order was not advanced, for logging — never surfaced to a user. */
  reason?: 'workflows-outstanding' | 'order-missing' | 'not-deliverable' | 'wrong-status';
  batchId?: string;
}

/**
 * Decides whether an order has finished production and, if so, moves it to READY_FOR_DISPATCH
 * and books it into a dispatch batch.
 *
 * Production completion means every non-dispatch workflow step is terminal (completed or skipped).
 * The dispatch step becoming READY alone is not enough — earlier departments must have finished.
 *
 * Self-pickup orders skip batching and go straight to COMPLETED.
 */
export class DispatchReadinessService {
  constructor(private readonly db: DispatchReadinessDb = prisma) {}

  async onWorkflowCompleted(workflowInstanceId: string): Promise<ReadinessOutcome> {
    const instance = await this.db.workflowInstance.findUnique({
      where: { id: workflowInstanceId },
      select: { orderId: true },
    });
    if (!instance) return { ready: false, reason: 'order-missing' };
    return this.evaluateOrder(instance.orderId);
  }

  async onTaskReady(taskId: string): Promise<ReadinessOutcome> {
    const task = await this.db.workflowTask.findUnique({
      where: { id: taskId },
      include: { workflowStep: true, workflowInstance: true },
    });
    if (!task) return { ready: false, reason: 'order-missing' };

    if (!isDispatchWorkflowStep(task.workflowStep)) {
      return { ready: false, reason: 'wrong-status' };
    }

    return this.evaluateOrder(task.workflowInstance.orderId);
  }

  async evaluateOrder(orderId: string): Promise<ReadinessOutcome> {
    const order = await this.db.productionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        customerId: true,
        retailCustomerId: true,
        deliveryRequired: true,
      },
    });
    if (!order) return { ready: false, reason: 'order-missing' };

    // Terminal or already-dispatched orders must not be re-batched by a late event.
    const advanceable: ProductionOrderStatus[] = [
      ProductionOrderStatus.ORDER_PLACED,
      ProductionOrderStatus.DESIGN,
      ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
      ProductionOrderStatus.IN_PRODUCTION,
      ProductionOrderStatus.QUALITY_CHECK,
      ProductionOrderStatus.CONFIRMED,
      ProductionOrderStatus.ARTWORK_APPROVED,
      ProductionOrderStatus.READY_FOR_DISPATCH,
    ];
    if (!advanceable.includes(order.status)) return { ready: false, reason: 'wrong-status' };

    const instances = await this.db.workflowInstance.findMany({
      where: { orderId: order.id },
      include: {
        tasks: {
          include: { workflowStep: true },
        },
      },
    });

    if (instances.length === 0) return { ready: false, reason: 'workflows-outstanding' };

    const productionComplete = instances.every((inst) =>
      isPreDispatchProductionComplete(inst.tasks, inst.status),
    );

    if (!productionComplete) return { ready: false, reason: 'workflows-outstanding' };

    const dispatchStillOpen = instances.some((inst) => hasOpenDispatchWork(inst.tasks));
    if (!dispatchStillOpen) return { ready: false, reason: 'wrong-status' };

    if (!order.deliveryRequired) {
      await this.db.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.productionOrder.update({
          where: { id: order.id },
          data: { status: ProductionOrderStatus.COMPLETED },
        });
        await recordOrderEvent(
          order.id,
          {
            eventType: 'ORDER_READY_FOR_PICKUP',
            title: 'Ready for pickup',
            description:
              'Production complete. This is a self-pickup order, so no dispatch is scheduled.',
          },
          tx,
        );
      });
      return { ready: false, reason: 'not-deliverable' };
    }

    const actor: DispatchActor = order.customerId
      ? { type: 'vendor', vendorId: order.customerId }
      : { type: 'retail', retailCustomerId: order.retailCustomerId! };

    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.productionOrder.update({
        where: { id: order.id },
        data: { status: ProductionOrderStatus.READY_FOR_DISPATCH },
      });

      const assignment = await shiftAssignmentService.assignToShift(order.id, actor, new Date(), tx);

      await recordOrderEvent(
        order.id,
        {
          eventType: 'ORDER_READY_FOR_DISPATCH',
          title: 'Ready for dispatch',
          description: `Scheduled for the ${assignment.batch.dispatchDate} dispatch.`,
          metadata: { dispatchBatchId: assignment.batch.id, dispatchDate: assignment.batch.dispatchDate },
        },
        tx,
      );

      return { ready: true, batchId: assignment.batch.id };
    });
  }
}

export const dispatchReadinessService = new DispatchReadinessService();

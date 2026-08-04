import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProductionOrderStatus, WorkflowInstanceStatus } from '@prisma/client';
import {
  DispatchReadinessService,
  type DispatchReadinessDb,
} from '../dispatch-readiness.service.js';
import { shiftAssignmentService } from '../shift-assignment.service.js';

interface OrderShape {
  id: string;
  status: ProductionOrderStatus;
  customerId: string | null;
  retailCustomerId: string | null;
  deliveryRequired: boolean;
  workflowInstances: Array<{ status: WorkflowInstanceStatus }>;
}

/** Hand-rolled fake — node:test's mock.method cannot patch Prisma's proxy-based model
 *  delegates (see retail-customer.service tests), so the service takes an injectable db. */
function createFakeDb(order: OrderShape | null) {
  const updates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const tx = {
    productionOrder: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...order, ...data };
      },
    },
    productionOrderEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return { id: 'evt-1', ...data };
      },
    },
  };

  const db: DispatchReadinessDb = {
    workflowInstance: {
      findUnique: (async () =>
        order ? { orderId: order.id } : null) as DispatchReadinessDb['workflowInstance']['findUnique'],
    } as DispatchReadinessDb['workflowInstance'],
    productionOrder: {
      findUnique: (async () => order) as DispatchReadinessDb['productionOrder']['findUnique'],
      update: (async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...order, ...data };
      }) as DispatchReadinessDb['productionOrder']['update'],
    } as DispatchReadinessDb['productionOrder'],
    $transaction: (async (fn: (t: unknown) => Promise<unknown>) =>
      fn(tx)) as DispatchReadinessDb['$transaction'],
  };

  return { db, updates, events };
}

function order(overrides: Partial<OrderShape> = {}): OrderShape {
  return {
    id: 'order-1',
    status: ProductionOrderStatus.IN_PRODUCTION,
    customerId: 'vendor-1',
    retailCustomerId: null,
    deliveryRequired: true,
    workflowInstances: [{ status: WorkflowInstanceStatus.COMPLETED }],
    ...overrides,
  };
}

describe('DispatchReadinessService — only ships when the whole order is done', () => {
  it('books the order into a batch once every workflow instance is complete', async (t) => {
    const { db, updates } = createFakeDb(order());
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => ({
      batch: { id: 'batch-1', dispatchDate: '2026-08-04' },
      created: true,
      alreadyAssigned: false,
    }));

    const service = new DispatchReadinessService(db);
    const outcome = await service.onWorkflowCompleted('wf-1');

    assert.equal(outcome.ready, true);
    assert.equal(outcome.batchId, 'batch-1');
    assert.equal(assign.mock.callCount(), 1);
    assert.equal(updates[0]!.status, ProductionOrderStatus.READY_FOR_DISPATCH);
  });

  it('waits while any sibling workflow is still running', async (t) => {
    const { db, updates } = createFakeDb(
      order({
        workflowInstances: [
          { status: WorkflowInstanceStatus.COMPLETED },
          { status: WorkflowInstanceStatus.IN_PROGRESS },
        ],
      }),
    );
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => {
      throw new Error('must not batch an order that is still in production');
    });

    const service = new DispatchReadinessService(db);
    const outcome = await service.onWorkflowCompleted('wf-1');

    assert.equal(outcome.ready, false);
    assert.equal(outcome.reason, 'workflows-outstanding');
    assert.equal(assign.mock.callCount(), 0);
    assert.equal(updates.length, 0, 'the order status is untouched');
  });

  it('completes a self-pickup order instead of batching it for delivery', async (t) => {
    const { db, updates } = createFakeDb(order({ deliveryRequired: false }));
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => {
      throw new Error('self-pickup orders must never enter a dispatch batch');
    });

    const service = new DispatchReadinessService(db);
    const outcome = await service.onWorkflowCompleted('wf-1');

    assert.equal(outcome.ready, false);
    assert.equal(outcome.reason, 'not-deliverable');
    assert.equal(assign.mock.callCount(), 0);
    assert.equal(updates[0]!.status, ProductionOrderStatus.COMPLETED);
  });

  it('routes a retail order to a retail batch', async (t) => {
    const { db } = createFakeDb(order({ customerId: null, retailCustomerId: 'retail-1' }));
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => ({
      batch: { id: 'batch-r', dispatchDate: '2026-08-04' },
      created: true,
      alreadyAssigned: false,
    }));

    const service = new DispatchReadinessService(db);
    await service.onWorkflowCompleted('wf-1');

    const actor = assign.mock.calls[0]!.arguments[1] as Record<string, unknown>;
    assert.deepEqual(actor, { type: 'retail', retailCustomerId: 'retail-1' });
  });

  it('ignores a late event for an already dispatched order', async (t) => {
    const { db, updates } = createFakeDb(order({ status: ProductionOrderStatus.DISPATCHED }));
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => {
      throw new Error('must not re-batch a dispatched order');
    });

    const service = new DispatchReadinessService(db);
    const outcome = await service.onWorkflowCompleted('wf-1');

    assert.equal(outcome.ready, false);
    assert.equal(outcome.reason, 'wrong-status');
    assert.equal(assign.mock.callCount(), 0);
    assert.equal(updates.length, 0);
  });

  it('does not treat an order with no workflows as finished', async (t) => {
    const { db } = createFakeDb(order({ workflowInstances: [] }));
    t.mock.method(shiftAssignmentService, 'assignToShift', async () => {
      throw new Error('an order with no workflows has not been produced');
    });

    const service = new DispatchReadinessService(db);
    const outcome = await service.onWorkflowCompleted('wf-1');

    assert.equal(outcome.ready, false);
    assert.equal(outcome.reason, 'workflows-outstanding');
  });
});

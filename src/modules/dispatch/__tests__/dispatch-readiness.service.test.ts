import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ProductionOrderStatus,
  WorkflowInstanceStatus,
  WorkflowStepType,
  WorkflowTaskStatus,
} from '@prisma/client';
import {
  DispatchReadinessService,
  type DispatchReadinessDb,
} from '../dispatch-readiness.service.js';
import { shiftAssignmentService } from '../shift-assignment.service.js';

interface TaskShape {
  status: WorkflowTaskStatus;
  workflowStep: { stepType: WorkflowStepType; stepCode: string | null };
}

interface InstanceShape {
  id: string;
  status: WorkflowInstanceStatus;
  tasks: TaskShape[];
}

interface OrderShape {
  id: string;
  status: ProductionOrderStatus;
  customerId: string | null;
  retailCustomerId: string | null;
  deliveryRequired: boolean;
}

function createFakeDb(
  order: OrderShape | null,
  instances: InstanceShape[] = [],
) {
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
      findUnique: (async ({ where }: { where: { id: string } }) => {
        const inst = instances.find((i) => i.id === where.id);
        return inst ? { orderId: order?.id ?? 'order-1' } : null;
      }) as DispatchReadinessDb['workflowInstance']['findUnique'],
      findMany: (async () => instances) as DispatchReadinessDb['workflowInstance']['findMany'],
    } as DispatchReadinessDb['workflowInstance'],
    workflowTask: {
      findUnique: (async ({ where }: { where: { id: string } }) => {
        for (const inst of instances) {
          const task = inst.tasks.find((_, idx) => `${inst.id}-task-${idx}` === where.id);
          if (task) {
            return {
              id: where.id,
              workflowStep: task.workflowStep,
              workflowInstance: { orderId: order?.id ?? 'order-1' },
            };
          }
        }
        return null;
      }) as DispatchReadinessDb['workflowTask']['findUnique'],
    } as DispatchReadinessDb['workflowTask'],
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
    ...overrides,
  };
}

function productionDoneWithDispatchReady(): InstanceShape[] {
  return [
    {
      id: 'wf-1',
      status: WorkflowInstanceStatus.RUNNING,
      tasks: [
        {
          status: WorkflowTaskStatus.COMPLETED,
          workflowStep: { stepType: WorkflowStepType.VERIFICATION, stepCode: 'VERIFICATION' },
        },
        {
          status: WorkflowTaskStatus.SKIPPED,
          workflowStep: { stepType: WorkflowStepType.PRINTING, stepCode: 'PRINTING' },
        },
        {
          status: WorkflowTaskStatus.READY,
          workflowStep: { stepType: WorkflowStepType.DISPATCH, stepCode: 'DISPATCH' },
        },
      ],
    },
  ];
}

describe('DispatchReadinessService — production must finish before dispatch', () => {
  it('books the order when production is done and dispatch is ready', async (t) => {
    const { db, updates } = createFakeDb(order(), productionDoneWithDispatchReady());
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => ({
      batch: { id: 'batch-1', dispatchDate: '2026-08-04' },
      created: true,
      alreadyAssigned: false,
    }));

    const service = new DispatchReadinessService(db);
    const outcome = await service.onTaskReady('wf-1-task-2');

    assert.equal(outcome.ready, true);
    assert.equal(outcome.batchId, 'batch-1');
    assert.equal(assign.mock.callCount(), 1);
    assert.equal(updates[0]!.status, ProductionOrderStatus.READY_FOR_DISPATCH);
  });

  it('does not batch when verification is still open alongside a ready dispatch task', async (t) => {
    const instances: InstanceShape[] = [
      {
        id: 'wf-1',
        status: WorkflowInstanceStatus.RUNNING,
        tasks: [
          {
            status: WorkflowTaskStatus.READY,
            workflowStep: { stepType: WorkflowStepType.VERIFICATION, stepCode: 'VERIFICATION' },
          },
          {
            status: WorkflowTaskStatus.READY,
            workflowStep: { stepType: WorkflowStepType.DISPATCH, stepCode: 'DISPATCH' },
          },
        ],
      },
    ];
    const { db, updates } = createFakeDb(order({ status: ProductionOrderStatus.ORDER_PLACED }), instances);
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => {
      throw new Error('must not batch while artwork verification is open');
    });

    const service = new DispatchReadinessService(db);
    const outcome = await service.onTaskReady('wf-1-task-1');

    assert.equal(outcome.ready, false);
    assert.equal(outcome.reason, 'workflows-outstanding');
    assert.equal(assign.mock.callCount(), 0);
    assert.equal(updates.length, 0);
  });

  it('does not batch on workflow completed when dispatch work is already finished', async (t) => {
    const instances: InstanceShape[] = [
      {
        id: 'wf-1',
        status: WorkflowInstanceStatus.COMPLETED,
        tasks: [
          {
            status: WorkflowTaskStatus.COMPLETED,
            workflowStep: { stepType: WorkflowStepType.VERIFICATION, stepCode: 'VERIFICATION' },
          },
          {
            status: WorkflowTaskStatus.COMPLETED,
            workflowStep: { stepType: WorkflowStepType.DISPATCH, stepCode: 'DISPATCH' },
          },
        ],
      },
    ];
    const { db, updates } = createFakeDb(order({ status: ProductionOrderStatus.DISPATCHED }), instances);
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => {
      throw new Error('must not re-batch after dispatch');
    });

    const service = new DispatchReadinessService(db);
    const outcome = await service.onWorkflowCompleted('wf-1');

    assert.equal(outcome.ready, false);
    assert.equal(assign.mock.callCount(), 0);
    assert.equal(updates.length, 0);
  });

  it('waits while any sibling workflow still has open production steps', async (t) => {
    const instances: InstanceShape[] = [
      ...productionDoneWithDispatchReady(),
      {
        id: 'wf-2',
        status: WorkflowInstanceStatus.RUNNING,
        tasks: [
          {
            status: WorkflowTaskStatus.IN_PROGRESS,
            workflowStep: { stepType: WorkflowStepType.PRINTING, stepCode: 'PRINTING' },
          },
          {
            status: WorkflowTaskStatus.PENDING,
            workflowStep: { stepType: WorkflowStepType.DISPATCH, stepCode: 'DISPATCH' },
          },
        ],
      },
    ];
    const { db, updates } = createFakeDb(order(), instances);
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => {
      throw new Error('must not batch an order still in production');
    });

    const service = new DispatchReadinessService(db);
    const outcome = await service.evaluateOrder('order-1');

    assert.equal(outcome.ready, false);
    assert.equal(outcome.reason, 'workflows-outstanding');
    assert.equal(assign.mock.callCount(), 0);
    assert.equal(updates.length, 0);
  });

  it('completes a self-pickup order instead of batching it for delivery', async (t) => {
    const { db, updates } = createFakeDb(
      order({ deliveryRequired: false }),
      productionDoneWithDispatchReady(),
    );
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => {
      throw new Error('self-pickup orders must never enter a dispatch batch');
    });

    const service = new DispatchReadinessService(db);
    const outcome = await service.evaluateOrder('order-1');

    assert.equal(outcome.ready, false);
    assert.equal(outcome.reason, 'not-deliverable');
    assert.equal(assign.mock.callCount(), 0);
    assert.equal(updates[0]!.status, ProductionOrderStatus.COMPLETED);
  });

  it('routes a retail order to a retail batch', async (t) => {
    const { db } = createFakeDb(
      order({ customerId: null, retailCustomerId: 'retail-1' }),
      productionDoneWithDispatchReady(),
    );
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => ({
      batch: { id: 'batch-r', dispatchDate: '2026-08-04' },
      created: true,
      alreadyAssigned: false,
    }));

    const service = new DispatchReadinessService(db);
    await service.evaluateOrder('order-1');

    const actor = assign.mock.calls[0]!.arguments[1] as Record<string, unknown>;
    assert.deepEqual(actor, { type: 'retail', retailCustomerId: 'retail-1' });
  });

  it('ignores a late event for an already dispatched order', async (t) => {
    const { db, updates } = createFakeDb(
      order({ status: ProductionOrderStatus.DISPATCHED }),
      productionDoneWithDispatchReady(),
    );
    const assign = t.mock.method(shiftAssignmentService, 'assignToShift', async () => {
      throw new Error('must not re-batch a dispatched order');
    });

    const service = new DispatchReadinessService(db);
    const outcome = await service.evaluateOrder('order-1');

    assert.equal(outcome.ready, false);
    assert.equal(outcome.reason, 'wrong-status');
    assert.equal(assign.mock.callCount(), 0);
    assert.equal(updates.length, 0);
  });
});

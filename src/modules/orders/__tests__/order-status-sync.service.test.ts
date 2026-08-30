import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ProductionOrderStatus,
  WorkflowStepType,
  WorkflowTaskStatus,
} from '@prisma/client';
import { syncOrderStatusForOrder } from '../order-status-sync.service.js';
import { prisma } from '../../../config/database.js';

type TaskRow = {
  status: WorkflowTaskStatus;
  workflowStep: { stepType: WorkflowStepType };
  department: { code: string };
};

function mockOrderFlow(orderId: string, status: ProductionOrderStatus, tasks: TaskRow[]) {
  const originalFindUnique = prisma.productionOrder.findUnique;
  const originalFindMany = prisma.workflowTask.findMany;
  const originalUpdate = prisma.productionOrder.update;

  let updatedStatus: ProductionOrderStatus | null = null;

  prisma.productionOrder.findUnique = (async () => ({
    id: orderId,
    status,
  })) as typeof prisma.productionOrder.findUnique;

  prisma.workflowTask.findMany = (async () => tasks) as typeof prisma.workflowTask.findMany;

  prisma.productionOrder.update = (async ({ data }: { data: { status: ProductionOrderStatus } }) => {
    updatedStatus = data.status;
    return { id: orderId, status: data.status };
  }) as typeof prisma.productionOrder.update;

  return {
    getUpdatedStatus: () => updatedStatus,
    restore: () => {
      prisma.productionOrder.findUnique = originalFindUnique;
      prisma.workflowTask.findMany = originalFindMany;
      prisma.productionOrder.update = originalUpdate;
    },
  };
}

describe('syncOrderStatusForOrder — dispatch step does not jump to ready for dispatch', () => {
  it('keeps order in artwork review when verification is active even if dispatch is ready', async () => {
    const mock = mockOrderFlow('order-1', ProductionOrderStatus.ORDER_PLACED, [
      {
        status: WorkflowTaskStatus.READY,
        workflowStep: { stepType: WorkflowStepType.VERIFICATION },
        department: { code: 'DESIGN' },
      },
      {
        status: WorkflowTaskStatus.READY,
        workflowStep: { stepType: WorkflowStepType.DISPATCH },
        department: { code: 'DISPATCH' },
      },
    ]);

    await syncOrderStatusForOrder('order-1');

    assert.equal(mock.getUpdatedStatus(), ProductionOrderStatus.UNDER_ARTWORK_REVIEW);
    mock.restore();
  });

  it('advances to in production when printing is active', async () => {
    const mock = mockOrderFlow('order-1', ProductionOrderStatus.UNDER_ARTWORK_REVIEW, [
      {
        status: WorkflowTaskStatus.IN_PROGRESS,
        workflowStep: { stepType: WorkflowStepType.PRINTING },
        department: { code: 'PRINTING' },
      },
      {
        status: WorkflowTaskStatus.READY,
        workflowStep: { stepType: WorkflowStepType.DISPATCH },
        department: { code: 'DISPATCH' },
      },
    ]);

    await syncOrderStatusForOrder('order-1');

    assert.equal(mock.getUpdatedStatus(), ProductionOrderStatus.IN_PRODUCTION);
    mock.restore();
  });
});

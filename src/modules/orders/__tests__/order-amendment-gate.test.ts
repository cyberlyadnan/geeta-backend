import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProductionOrderStatus, WorkflowTaskStatus } from '@prisma/client';
import { checkOrderAmendable } from '../order-amendment-gate.js';

function task(stepName: string, locksAmendmentsOnStart: boolean, status: WorkflowTaskStatus) {
  return { status, workflowStep: { locksAmendmentsOnStart, stepName } };
}

describe('checkOrderAmendable', () => {
  it('rejects a cancelled order regardless of workflow state', () => {
    const result = checkOrderAmendable({
      orderStatus: ProductionOrderStatus.CANCELLED,
      workflowTasks: [],
    });
    assert.equal(result.amendable, false);
    assert.match(result.reason ?? '', /cancelled/i);
  });

  it('rejects a delivered order', () => {
    const result = checkOrderAmendable({
      orderStatus: ProductionOrderStatus.DELIVERED,
      workflowTasks: [],
    });
    assert.equal(result.amendable, false);
  });

  it('is amendable when no step in the template locks amendments, no matter the task statuses', () => {
    const result = checkOrderAmendable({
      orderStatus: ProductionOrderStatus.IN_PRODUCTION,
      workflowTasks: [
        task('Printing', false, WorkflowTaskStatus.COMPLETED),
        task('Dispatch', false, WorkflowTaskStatus.IN_PROGRESS),
      ],
    });
    assert.equal(result.amendable, true);
  });

  it('is amendable while the flagged step has not started yet (still queued)', () => {
    const result = checkOrderAmendable({
      orderStatus: ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
      workflowTasks: [task('Printing', true, WorkflowTaskStatus.READY)],
    });
    assert.equal(result.amendable, true);
  });

  it('is rejected once the flagged step has started, naming that step', () => {
    const result = checkOrderAmendable({
      orderStatus: ProductionOrderStatus.IN_PRODUCTION,
      workflowTasks: [task('Printing', true, WorkflowTaskStatus.IN_PROGRESS)],
    });
    assert.equal(result.amendable, false);
    assert.match(result.reason ?? '', /Printing/);
  });

  it('is rejected once the flagged step has completed', () => {
    const result = checkOrderAmendable({
      orderStatus: ProductionOrderStatus.IN_PRODUCTION,
      workflowTasks: [task('Printing', true, WorkflowTaskStatus.COMPLETED)],
    });
    assert.equal(result.amendable, false);
  });

  it('reads the cutoff from whichever step is flagged per template — not a hardcoded status list', () => {
    // Same order status (IN_PRODUCTION) is amendable or not purely based on the template's flag.
    const withoutLock = checkOrderAmendable({
      orderStatus: ProductionOrderStatus.IN_PRODUCTION,
      workflowTasks: [task('Lamination', false, WorkflowTaskStatus.IN_PROGRESS)],
    });
    const withLock = checkOrderAmendable({
      orderStatus: ProductionOrderStatus.IN_PRODUCTION,
      workflowTasks: [task('Lamination', true, WorkflowTaskStatus.IN_PROGRESS)],
    });
    assert.equal(withoutLock.amendable, true);
    assert.equal(withLock.amendable, false);
  });
});

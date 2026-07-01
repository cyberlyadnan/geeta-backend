import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  WorkflowTaskExecutionSessionStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import {
  assertSessionTransition,
  assertTaskStatusForComplete,
  assertTaskStatusForPause,
  assertTaskStatusForResume,
  taskStatusForSessionStart,
} from '../execution-state-machine.js';
import {
  accumulateDuration,
  computeTotalDuration,
  durationSeconds,
} from '../time-tracking.util.js';
import { canExecuteTasks, canViewDepartmentExecution } from '../execution.access.js';
import { RoleName } from '@prisma/client';

describe('execution-state-machine', () => {
  it('allows ASSIGNED to start as IN_PROGRESS', () => {
    assert.equal(taskStatusForSessionStart(WorkflowTaskStatus.ASSIGNED), WorkflowTaskStatus.IN_PROGRESS);
  });

  it('allows session IN_PROGRESS to pause', () => {
    assert.doesNotThrow(() =>
      assertSessionTransition(
        WorkflowTaskExecutionSessionStatus.IN_PROGRESS,
        WorkflowTaskExecutionSessionStatus.PAUSED,
      ),
    );
  });

  it('rejects pause when task is not IN_PROGRESS', () => {
    assert.throws(() => assertTaskStatusForPause(WorkflowTaskStatus.ASSIGNED));
  });

  it('allows resume from PAUSED', () => {
    assert.doesNotThrow(() => assertTaskStatusForResume(WorkflowTaskStatus.PAUSED));
  });

  it('requires IN_PROGRESS to complete', () => {
    assert.throws(() => assertTaskStatusForComplete(WorkflowTaskStatus.PAUSED));
  });
});

describe('time-tracking.util', () => {
  it('computes duration seconds', () => {
    const start = new Date('2026-01-01T10:00:00Z');
    const end = new Date('2026-01-01T10:05:30Z');
    assert.equal(durationSeconds(start, end), 330);
  });

  it('accumulates working time across pause cycles', () => {
    const totals = accumulateDuration('WORKING', 120, {
      workingDurationSeconds: 60,
      pausedDurationSeconds: 0,
      holdDurationSeconds: 0,
    });
    assert.equal(totals.workingDurationSeconds, 180);
    assert.equal(computeTotalDuration(totals), 180);
  });

  it('accumulates paused and hold separately', () => {
    let totals = { workingDurationSeconds: 100, pausedDurationSeconds: 0, holdDurationSeconds: 0 };
    totals = accumulateDuration('PAUSED', 30, totals);
    totals = accumulateDuration('HOLD', 45, totals);
    assert.equal(totals.pausedDurationSeconds, 30);
    assert.equal(totals.holdDurationSeconds, 45);
    assert.equal(computeTotalDuration(totals), 175);
  });
});

describe('execution.access', () => {
  it('allows staff with execute permission', () => {
    assert.equal(canExecuteTasks(RoleName.STAFF, ['production.task.execute']), true);
  });

  it('allows managers without explicit permission', () => {
    assert.equal(canExecuteTasks(RoleName.MANAGER, []), true);
  });

  it('denies staff without permission', () => {
    assert.equal(canExecuteTasks(RoleName.STAFF, []), false);
  });

  it('allows department execution view for managers', () => {
    assert.equal(canViewDepartmentExecution(RoleName.MANAGER, []), true);
  });
});

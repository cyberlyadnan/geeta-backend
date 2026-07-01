import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowTaskStatus, WorkflowInstanceStatus } from '@prisma/client';
import { assertTaskTransition, isTaskDependencySatisfied } from '../task-state-machine.js';
import { assertWorkflowInstanceTransition } from '../workflow-instance-state-machine.js';
import {
  buildImplicitTemplateDependencies,
  resolveReadyTaskIds,
  resolveTemplateDependencies,
} from '../dependency-engine.js';
import { ApiError } from '../../../common/errors/ApiError.js';

describe('task-state-machine', () => {
  it('allows BLOCKED → READY', () => {
    assert.doesNotThrow(() =>
      assertTaskTransition(WorkflowTaskStatus.BLOCKED, WorkflowTaskStatus.READY),
    );
  });

  it('allows READY → IN_PROGRESS', () => {
    assert.doesNotThrow(() =>
      assertTaskTransition(WorkflowTaskStatus.READY, WorkflowTaskStatus.IN_PROGRESS),
    );
  });

  it('rejects COMPLETED → READY', () => {
    assert.throws(
      () => assertTaskTransition(WorkflowTaskStatus.COMPLETED, WorkflowTaskStatus.READY),
      (error: unknown) => error instanceof ApiError,
    );
  });

  it('FINISH_TO_START requires prerequisite completion', () => {
    assert.equal(isTaskDependencySatisfied('FINISH_TO_START', WorkflowTaskStatus.IN_PROGRESS), false);
    assert.equal(isTaskDependencySatisfied('FINISH_TO_START', WorkflowTaskStatus.COMPLETED), true);
    assert.equal(isTaskDependencySatisfied('FINISH_TO_START', WorkflowTaskStatus.SKIPPED), true);
  });

  it('START_TO_START requires prerequisite in progress or done', () => {
    assert.equal(isTaskDependencySatisfied('START_TO_START', WorkflowTaskStatus.READY), false);
    assert.equal(isTaskDependencySatisfied('START_TO_START', WorkflowTaskStatus.IN_PROGRESS), true);
  });
});

describe('workflow-instance-state-machine', () => {
  it('allows INITIALIZED → RUNNING', () => {
    assert.doesNotThrow(() =>
      assertWorkflowInstanceTransition(
        WorkflowInstanceStatus.INITIALIZED,
        WorkflowInstanceStatus.RUNNING,
      ),
    );
  });

  it('rejects COMPLETED → RUNNING', () => {
    assert.throws(
      () =>
        assertWorkflowInstanceTransition(
          WorkflowInstanceStatus.COMPLETED,
          WorkflowInstanceStatus.RUNNING,
        ),
      (error: unknown) => error instanceof ApiError,
    );
  });
});

describe('dependency-engine', () => {
  it('builds implicit sequential dependencies', () => {
    const steps = [
      { id: 's1', stepOrder: 1, isMandatory: true, allowSkip: false },
      { id: 's2', stepOrder: 2, isMandatory: true, allowSkip: false },
      { id: 's3', stepOrder: 3, isMandatory: true, allowSkip: false },
    ];

    const implicit = buildImplicitTemplateDependencies(steps);
    assert.equal(implicit.length, 2);
    assert.equal(implicit[0]?.dependsOnStepId, 's1');
    assert.equal(implicit[0]?.workflowTemplateStepId, 's2');
  });

  it('uses explicit dependencies when present', () => {
    const steps = [
      { id: 's1', stepOrder: 1, isMandatory: true, allowSkip: false },
      { id: 's2', stepOrder: 2, isMandatory: true, allowSkip: false },
    ];
    const explicit = [
      {
        workflowTemplateStepId: 's2',
        dependsOnStepId: 's1',
        dependencyType: 'START_TO_START' as const,
      },
    ];

    const resolved = resolveTemplateDependencies(steps, explicit);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0]?.dependencyType, 'START_TO_START');
  });

  it('resolves first task as READY with sequential deps', () => {
    const tasks = [
      { id: 't1', templateStepId: 's1' },
      { id: 't2', templateStepId: 's2' },
    ];
    const deps = [
      { taskId: 't2', dependsOnTaskId: 't1', dependencyType: 'FINISH_TO_START' as const },
    ];
    const statuses = new Map<string, WorkflowTaskStatus>([
      ['t1', WorkflowTaskStatus.BLOCKED],
      ['t2', WorkflowTaskStatus.BLOCKED],
    ]);

    const ready = resolveReadyTaskIds(tasks, deps, statuses);
    assert.deepEqual(ready, ['t1']);
  });

  it('unblocks next task after prerequisite completes', () => {
    const tasks = [
      { id: 't1', templateStepId: 's1' },
      { id: 't2', templateStepId: 's2' },
    ];
    const deps = [
      { taskId: 't2', dependsOnTaskId: 't1', dependencyType: 'FINISH_TO_START' as const },
    ];
    const statuses = new Map<string, WorkflowTaskStatus>([
      ['t1', WorkflowTaskStatus.COMPLETED],
      ['t2', WorkflowTaskStatus.BLOCKED],
    ]);

    const ready = resolveReadyTaskIds(tasks, deps, statuses);
    assert.deepEqual(ready, ['t2']);
  });
});

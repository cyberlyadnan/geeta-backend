import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WorkflowInstanceStatus,
  WorkflowStepType,
  WorkflowTaskStatus,
} from '@prisma/client';
import {
  hasOpenDispatchWork,
  isDispatchWorkflowStep,
  isPreDispatchProductionComplete,
  isWorkflowTaskTerminal,
} from '../workflow-dispatch.util.js';

describe('workflow-dispatch.util', () => {
  it('detects dispatch steps', () => {
    assert.equal(isDispatchWorkflowStep({ stepType: WorkflowStepType.DISPATCH, stepCode: 'DISPATCH' }), true);
    assert.equal(isDispatchWorkflowStep({ stepType: WorkflowStepType.PRINTING, stepCode: 'PRINTING' }), false);
  });

  it('requires non-dispatch steps to be terminal before production is complete', () => {
    const tasks = [
      {
        status: WorkflowTaskStatus.READY,
        workflowStep: { stepType: WorkflowStepType.VERIFICATION, stepCode: 'VERIFICATION' },
      },
      {
        status: WorkflowTaskStatus.READY,
        workflowStep: { stepType: WorkflowStepType.DISPATCH, stepCode: 'DISPATCH' },
      },
    ];
    assert.equal(isPreDispatchProductionComplete(tasks, WorkflowInstanceStatus.RUNNING), false);
    assert.equal(hasOpenDispatchWork(tasks), true);
  });

  it('marks production complete when only dispatch work remains', () => {
    const tasks = [
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
    ];
    assert.equal(isPreDispatchProductionComplete(tasks, WorkflowInstanceStatus.RUNNING), true);
    assert.equal(hasOpenDispatchWork(tasks), true);
    assert.equal(isWorkflowTaskTerminal(WorkflowTaskStatus.COMPLETED), true);
    assert.equal(isWorkflowTaskTerminal(WorkflowTaskStatus.READY), false);
  });
});

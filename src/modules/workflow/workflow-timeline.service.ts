import type { Prisma, WorkflowTimelineEntityType } from '@prisma/client';
import { WORKFLOW_TIMELINE_EVENTS } from './workflow.constants.js';
import { workflowRepository } from './workflow.repository.js';

export interface TimelineEventInput {
  workflowInstanceId: string;
  entityType: WorkflowTimelineEntityType;
  entityId?: string;
  eventType: string;
  title: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
  actorId?: string;
}

export class WorkflowTimelineService {
  async recordEvents(events: TimelineEventInput[], tx: Prisma.TransactionClient) {
    return workflowRepository.bulkCreateTimelineEvents(events, tx);
  }

  workflowCreated(input: {
    workflowInstanceId: string;
    templateCode: string;
    orderId: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_INSTANCE',
      entityId: input.workflowInstanceId,
      eventType: WORKFLOW_TIMELINE_EVENTS.WORKFLOW_CREATED,
      title: 'Workflow created',
      description: `Production workflow initialized from template ${input.templateCode}`,
      metadata: { orderId: input.orderId, templateCode: input.templateCode },
      actorId: input.actorId,
    };
  }

  tasksGenerated(input: {
    workflowInstanceId: string;
    taskCount: number;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_INSTANCE',
      entityId: input.workflowInstanceId,
      eventType: WORKFLOW_TIMELINE_EVENTS.TASKS_GENERATED,
      title: 'Tasks generated',
      description: `${input.taskCount} production task(s) created from workflow template`,
      metadata: { taskCount: input.taskCount },
      actorId: input.actorId,
    };
  }

  taskReady(input: {
    workflowInstanceId: string;
    taskId: string;
    stepCode: string;
    stepName: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.TASK_READY,
      title: 'Task ready',
      description: `${input.stepName} (${input.stepCode}) is ready for execution`,
      metadata: { stepCode: input.stepCode },
      actorId: input.actorId,
    };
  }

  taskActivated(input: {
    workflowInstanceId: string;
    taskId: string;
    stepCode: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.TASK_ACTIVATED,
      title: 'Task activated',
      description: `Task ${input.stepCode} activated in production queue`,
      metadata: { stepCode: input.stepCode },
      actorId: input.actorId,
    };
  }

  taskCompleted(input: {
    workflowInstanceId: string;
    taskId: string;
    stepCode: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.TASK_COMPLETED,
      title: 'Task completed',
      description: `Task ${input.stepCode} completed`,
      metadata: { stepCode: input.stepCode },
      actorId: input.actorId,
    };
  }

  workflowCompleted(input: {
    workflowInstanceId: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_INSTANCE',
      entityId: input.workflowInstanceId,
      eventType: WORKFLOW_TIMELINE_EVENTS.WORKFLOW_COMPLETED,
      title: 'Workflow completed',
      description: 'All production tasks have been completed',
      actorId: input.actorId,
    };
  }

  workflowCancelled(input: {
    workflowInstanceId: string;
    reason?: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_INSTANCE',
      entityId: input.workflowInstanceId,
      eventType: WORKFLOW_TIMELINE_EVENTS.WORKFLOW_CANCELLED,
      title: 'Workflow cancelled',
      description: input.reason ?? 'Workflow was cancelled',
      actorId: input.actorId,
    };
  }

  statusChanged(input: {
    workflowInstanceId: string;
    from: string;
    to: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_INSTANCE',
      entityId: input.workflowInstanceId,
      eventType: WORKFLOW_TIMELINE_EVENTS.STATUS_CHANGED,
      title: 'Workflow status changed',
      description: `Status changed from ${input.from} to ${input.to}`,
      metadata: { from: input.from, to: input.to },
      actorId: input.actorId,
    };
  }

  taskStarted(input: {
    workflowInstanceId: string;
    taskId: string;
    stepName: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.TASK_STARTED,
      title: 'Task started',
      description: `${input.stepName} production started`,
      actorId: input.actorId,
    };
  }

  taskPaused(input: {
    workflowInstanceId: string;
    taskId: string;
    actorId?: string;
    remarks?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.TASK_PAUSED,
      title: 'Task paused',
      description: input.remarks ?? 'Production paused',
      actorId: input.actorId,
    };
  }

  taskResumed(input: {
    workflowInstanceId: string;
    taskId: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.TASK_RESUMED,
      title: 'Task resumed',
      description: 'Production resumed',
      actorId: input.actorId,
    };
  }

  taskHeld(input: {
    workflowInstanceId: string;
    taskId: string;
    reason: string;
    actorId?: string;
    notes?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.TASK_HELD,
      title: 'Task on hold',
      description: input.notes ?? `Hold reason: ${input.reason}`,
      metadata: { reason: input.reason },
      actorId: input.actorId,
    };
  }

  taskNoteAdded(input: {
    workflowInstanceId: string;
    taskId: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.TASK_NOTE_ADDED,
      title: 'Production note added',
      actorId: input.actorId,
    };
  }

  taskAttachmentAdded(input: {
    workflowInstanceId: string;
    taskId: string;
    category: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.TASK_ATTACHMENT_ADDED,
      title: 'Production attachment uploaded',
      metadata: { category: input.category },
      actorId: input.actorId,
    };
  }

  supervisorRequested(input: {
    workflowInstanceId: string;
    taskId: string;
    actorId?: string;
    notes?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.SUPERVISOR_REQUESTED,
      title: 'Supervisor requested',
      description: input.notes,
      actorId: input.actorId,
    };
  }

  issueReported(input: {
    workflowInstanceId: string;
    taskId: string;
    actorId?: string;
    notes?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.ISSUE_REPORTED,
      title: 'Production issue reported',
      description: input.notes,
      actorId: input.actorId,
    };
  }

  qcStarted(input: {
    workflowInstanceId: string;
    taskId: string;
    stepName: string;
    actorId?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.QC_STARTED,
      title: 'QC inspection started',
      description: input.stepName,
      actorId: input.actorId,
    };
  }

  qcPassed(input: {
    workflowInstanceId: string;
    taskId: string;
    stepName: string;
    actorId?: string;
    remarks?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.QC_PASSED,
      title: 'QC passed',
      description: input.remarks ?? input.stepName,
      actorId: input.actorId,
    };
  }

  qcFailed(input: {
    workflowInstanceId: string;
    taskId: string;
    stepName: string;
    actorId?: string;
    remarks?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.QC_FAILED,
      title: 'QC failed',
      description: input.remarks ?? input.stepName,
      actorId: input.actorId,
    };
  }

  qcHeld(input: {
    workflowInstanceId: string;
    taskId: string;
    stepName: string;
    actorId?: string;
    remarks?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.QC_HELD,
      title: 'QC on hold',
      description: input.remarks ?? input.stepName,
      actorId: input.actorId,
    };
  }

  workflowReworked(input: {
    workflowInstanceId: string;
    taskId: string;
    targetStepCode: string;
    actorId?: string;
    remarks?: string;
  }): TimelineEventInput {
    return {
      workflowInstanceId: input.workflowInstanceId,
      entityType: 'WORKFLOW_TASK',
      entityId: input.taskId,
      eventType: WORKFLOW_TIMELINE_EVENTS.WORKFLOW_REWORKED,
      title: 'Rework initiated',
      description: input.remarks ?? `Rework on ${input.targetStepCode}`,
      metadata: { targetStepCode: input.targetStepCode },
      actorId: input.actorId,
    };
  }
}

export const workflowTimelineService = new WorkflowTimelineService();

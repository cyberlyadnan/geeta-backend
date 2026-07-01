import type { ExecutionSessionRecord } from './execution.repository.js';
import { computeTotalDuration, liveElapsedSeconds } from './time-tracking.util.js';

function userName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export function mapExecutionSessionToDto(
  session: ExecutionSessionRecord,
  now = new Date(),
) {
  const liveSeconds = session.activeIntervalStartedAt
    ? liveElapsedSeconds(session.activeIntervalStartedAt, now)
    : 0;

  const workingDurationSeconds =
    session.workingDurationSeconds +
    (session.activeIntervalType === 'WORKING' ? liveSeconds : 0);
  const pausedDurationSeconds =
    session.pausedDurationSeconds +
    (session.activeIntervalType === 'PAUSED' ? liveSeconds : 0);
  const holdDurationSeconds =
    session.holdDurationSeconds +
    (session.activeIntervalType === 'HOLD' ? liveSeconds : 0);

  const totals = {
    workingDurationSeconds,
    pausedDurationSeconds,
    holdDurationSeconds,
  };

  return {
    id: session.id,
    taskId: session.workflowTaskId,
    assignmentId: session.assignmentId,
    operatorId: session.operatorId,
    departmentId: session.departmentId,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    pausedAt: session.pausedAt?.toISOString() ?? null,
    resumedAt: session.resumedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
    workingDurationSeconds,
    pausedDurationSeconds,
    holdDurationSeconds,
    totalDurationSeconds: computeTotalDuration(totals),
    activeIntervalType: session.activeIntervalType,
    operator: {
      id: session.operator.id,
      name: userName(session.operator.firstName, session.operator.lastName),
      email: session.operator.email,
    },
    department: session.department,
  };
}

export function mapDepartmentExecutionItem(
  row: {
    id: string;
    workflowTaskId: string;
    operatorId: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    workingDurationSeconds: number;
    pausedDurationSeconds: number;
    holdDurationSeconds: number;
    totalDurationSeconds: number;
    activeIntervalStartedAt: Date | null;
    activeIntervalType: string | null;
    operator: { id: string; firstName: string; lastName: string };
    workflowTask: {
      id: string;
      status: string;
      priority: string;
      dueAt: Date | null;
      workflowStep: { stepCode: string; stepName: string };
      workflowInstance: { order: { orderNumber: string; orderName: string | null } };
    };
  },
  now = new Date(),
) {
  const liveSeconds = row.activeIntervalStartedAt
    ? liveElapsedSeconds(row.activeIntervalStartedAt, now)
    : 0;

  let elapsedWorking = row.workingDurationSeconds;
  if (row.activeIntervalType === 'WORKING') elapsedWorking += liveSeconds;

  return {
    sessionId: row.id,
    taskId: row.workflowTaskId,
    orderNumber: row.workflowTask.workflowInstance.order.orderNumber,
    orderName: row.workflowTask.workflowInstance.order.orderName,
    step: row.workflowTask.workflowStep,
    taskStatus: row.workflowTask.status,
    sessionStatus: row.status,
    priority: row.workflowTask.priority,
    dueAt: row.workflowTask.dueAt?.toISOString() ?? null,
    operator: {
      id: row.operator.id,
      name: userName(row.operator.firstName, row.operator.lastName),
    },
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    elapsedWorkingSeconds: elapsedWorking,
    totalDurationSeconds: row.totalDurationSeconds + liveSeconds,
  };
}

export function mapNoteToDto(note: {
  id: string;
  text: string;
  createdAt: Date;
  operator: { id: string; firstName: string; lastName: string };
  department: { id: string; code: string; name: string };
  fileAsset: { id: string; originalName: string; fileUrl: string; mimeType: string } | null;
}) {
  return {
    id: note.id,
    text: note.text,
    createdAt: note.createdAt.toISOString(),
    operator: {
      id: note.operator.id,
      name: userName(note.operator.firstName, note.operator.lastName),
    },
    department: note.department,
    attachment: note.fileAsset
      ? {
          id: note.fileAsset.id,
          name: note.fileAsset.originalName,
          url: note.fileAsset.fileUrl,
          mimeType: note.fileAsset.mimeType,
        }
      : null,
  };
}

export function mapAttachmentToDto(row: {
  id: string;
  category: string;
  label: string | null;
  createdAt: Date;
  uploadedBy: { id: string; firstName: string; lastName: string };
  fileAsset: {
    id: string;
    originalName: string;
    fileUrl: string;
    mimeType: string;
    fileSize: number;
  };
}) {
  return {
    id: row.id,
    category: row.category,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    uploadedBy: {
      id: row.uploadedBy.id,
      name: userName(row.uploadedBy.firstName, row.uploadedBy.lastName),
    },
    file: {
      id: row.fileAsset.id,
      name: row.fileAsset.originalName,
      url: row.fileAsset.fileUrl,
      mimeType: row.fileAsset.mimeType,
      size: row.fileAsset.fileSize,
    },
  };
}

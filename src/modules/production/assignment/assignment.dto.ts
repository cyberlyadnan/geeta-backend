import type {
  AssignmentHistoryRecord,
  AssignmentRecord,
  MyAssignedTaskRecord,
} from './assignment.repository.js';

export interface AssignmentDto {
  id: string;
  workflowTaskId: string;
  operatorId: string;
  departmentId: string;
  machineId: string | null;
  assignedById: string;
  assignedAt: string;
  priority: string;
  dueAt: string | null;
  estimatedMinutes: number;
  remarks: string | null;
  status: string;
  operator: {
    id: string;
    name: string;
    email: string;
  };
  assignedBy: { id: string; name: string };
  machine: { id: string; machineCode: string; machineName: string } | null;
  department: { id: string; code: string; name: string };
}

export interface AssignmentHistoryDto {
  id: string;
  assignmentId: string | null;
  workflowTaskId: string;
  action: string;
  operatorId: string | null;
  previousOperatorId: string | null;
  priority: string | null;
  previousPriority: string | null;
  dueAt: string | null;
  previousDueAt: string | null;
  remarks: string | null;
  previousRemarks: string | null;
  machineId: string | null;
  previousMachineId: string | null;
  metadata: unknown;
  createdAt: string;
  performedBy: { id: string; name: string } | null;
  operator: { id: string; name: string } | null;
}

export interface OperatorDto {
  id: string;
  name: string;
  email: string;
  roleCode: string;
  isPrimary: boolean;
}

export interface MyAssignedTaskDto {
  assignmentId: string;
  taskId: string;
  /**
   * Where this task's artwork stands, so the verifier's list can flag work that has come back
   * to them. "awaiting_vendor" — they asked for a revision and it hasn't arrived;
   * "changes_made" — the vendor has resubmitted and it needs another look.
   */
  artworkState: 'awaiting_vendor' | 'changes_made' | 'approved' | 'pending' | 'none';
  orderNumber: string;
  orderName: string | null;
  productName: string;
  quantity: number;
  department: { id: string; code: string; name: string };
  step: { code: string; name: string };
  taskStatus: string;
  assignmentStatus: string;
  priority: string;
  dueAt: string | null;
  estimatedMinutes: number;
  assignedAt: string;
  remarks: string | null;
  machine: {
    id: string;
    machineCode: string;
    machineName: string;
    machineType: string | null;
    operationalStatus: string;
    notes: string | null;
  } | null;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function userName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

export function mapAssignmentToDto(record: AssignmentRecord): AssignmentDto {
  return {
    id: record.id,
    workflowTaskId: record.workflowTaskId,
    operatorId: record.operatorId,
    departmentId: record.departmentId,
    machineId: record.machineId,
    assignedById: record.assignedById,
    assignedAt: record.assignedAt.toISOString(),
    priority: record.priority,
    dueAt: toIso(record.dueAt),
    estimatedMinutes: record.estimatedMinutes,
    remarks: record.remarks,
    status: record.status,
    operator: {
      id: record.operator.id,
      name: userName(record.operator.firstName, record.operator.lastName),
      email: record.operator.email,
    },
    assignedBy: {
      id: record.assignedBy.id,
      name: userName(record.assignedBy.firstName, record.assignedBy.lastName),
    },
    machine: record.machine,
    department: record.department,
  };
}

export function mapAssignmentHistoryToDto(record: AssignmentHistoryRecord): AssignmentHistoryDto {
  return {
    id: record.id,
    assignmentId: record.assignmentId,
    workflowTaskId: record.workflowTaskId,
    action: record.action,
    operatorId: record.operatorId,
    previousOperatorId: record.previousOperatorId,
    priority: record.priority,
    previousPriority: record.previousPriority,
    dueAt: toIso(record.dueAt),
    previousDueAt: toIso(record.previousDueAt),
    remarks: record.remarks,
    previousRemarks: record.previousRemarks,
    machineId: record.machineId,
    previousMachineId: record.previousMachineId,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    performedBy: record.performedBy
      ? {
          id: record.performedBy.id,
          name: userName(record.performedBy.firstName, record.performedBy.lastName),
        }
      : null,
    operator: record.operator
      ? {
          id: record.operator.id,
          name: userName(record.operator.firstName, record.operator.lastName),
        }
      : null,
  };
}

export interface QueueAssignmentSummaryDto {
  assignmentId: string | null;
  status: string | null;
  assignedAt: string | null;
  operator: { id: string; name: string } | null;
}

export function mapQueueAssignmentSummary(
  assignment?: {
    id: string;
    status: string;
    assignedAt: Date;
    operator: { id: string; firstName: string; lastName: string };
  } | null,
): QueueAssignmentSummaryDto {
  if (!assignment) {
    return { assignmentId: null, status: null, assignedAt: null, operator: null };
  }

  return {
    assignmentId: assignment.id,
    status: assignment.status,
    assignedAt: assignment.assignedAt.toISOString(),
    operator: {
      id: assignment.operator.id,
      name: userName(assignment.operator.firstName, assignment.operator.lastName),
    },
  };
}

export function mapOperatorToDto(
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    departmentAssignments: Array<{ roleCode: string; isPrimary: boolean }>;
  },
): OperatorDto {
  const assignment = user.departmentAssignments[0];
  return {
    id: user.id,
    name: userName(user.firstName, user.lastName),
    email: user.email,
    roleCode: assignment?.roleCode ?? 'OPERATOR',
    isPrimary: assignment?.isPrimary ?? false,
  };
}

export function mapMyAssignedTask(record: MyAssignedTaskRecord): MyAssignedTaskDto {
  const task = record.workflowTask;
  const offering = task.workflowInstance.productionOrderItem.productOfferingVersion?.productOffering;

  // Artwork state for the verifier's row. "changes_made" means the vendor has resubmitted since
  // a revision was requested — the signal that pulls a task back onto the verifier's plate.
  const approvals = task.workflowInstance.productionOrderItem.orderArtworks.map(
    (a) => a.approvalStatus,
  );
  const artworkState: MyAssignedTaskDto['artworkState'] =
    approvals.length === 0
      ? 'none'
      : approvals.includes('REVISION_REQUESTED')
        ? 'awaiting_vendor'
        : approvals.includes('PENDING')
          ? 'changes_made'
          : approvals.every((a) => a === 'APPROVED')
            ? 'approved'
            : 'pending';

  return {
    assignmentId: record.id,
    taskId: record.workflowTaskId,
    artworkState,
    orderNumber: task.workflowInstance.order.orderNumber,
    orderName: task.workflowInstance.order.orderName,
    productName: offering?.displayName ?? offering?.name ?? 'Product',
    quantity: task.workflowInstance.productionOrderItem.quantity,
    department: record.department,
    step: { code: task.workflowStep.stepCode, name: task.workflowStep.stepName },
    taskStatus: task.status,
    assignmentStatus: record.status,
    priority: record.priority,
    dueAt: toIso(record.dueAt),
    estimatedMinutes: record.estimatedMinutes,
    assignedAt: record.assignedAt.toISOString(),
    remarks: record.remarks,
    machine: record.machine
      ? {
          id: record.machine.id,
          machineCode: record.machine.machineCode,
          machineName: record.machine.machineName,
          machineType: record.machine.machineType,
          operationalStatus: record.machine.operationalStatus,
          notes: record.machine.notes,
        }
      : null,
  };
}

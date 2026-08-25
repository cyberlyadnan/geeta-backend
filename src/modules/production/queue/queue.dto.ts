import type {
  DepartmentListItemRecord,
  QueueTaskDetailRecord,
  QueueTaskListRecord,
} from './queue.repository.js';
import { mapQueueAssignmentSummary } from '../assignment/assignment.dto.js';
import { buildConfigurationEntries, type ConfigurationEntry } from '../configuration-highlight.util.js';

export interface DepartmentQueueCountsDto {
  ready: number;
  blocked: number;
  completedToday: number;
  rush: number;
  delayed: number;
  inProgress: number;
  total: number;
}

export interface DepartmentListItemDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  counts: DepartmentQueueCountsDto;
}

export interface QueueTaskBadgesDto {
  rush: boolean;
  rework: boolean;
  blocked: boolean;
}

export interface QueueWorkflowProgressStepDto {
  id: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  stepType: string;
  status: string;
  isCurrent: boolean;
  isCompleted: boolean;
  isFuture: boolean;
  jobSlipBeforeThisStep: boolean;
}

export interface QueueTaskCardDto {
  id: string;
  workflowInstanceId: string;
  orderId: string;
  orderNumber: string;
  orderName: string | null;
  vendor: {
    id: string;
    name: string;
    businessName: string | null;
    memberCode: string | null;
    /** Direct contact so the verifier can call the vendor without leaving the task. */
    phone: string | null;
    email: string | null;
  };
  product: {
    id: string | null;
    name: string;
    displayName: string | null;
    quantity: number;
  };
  department: { id: string; code: string; name: string };
  workflowStep: { id: string; stepCode: string; stepName: string; stepType: string };
  workflowStatus: string;
  workflowProgress: {
    currentStepOrder: number;
    completedSteps: number;
    totalSteps: number;
    percent: number;
  };
  priority: string;
  status: string;
  createdAt: string;
  queuedAt: string | null;
  dueAt: string | null;
  estimatedMinutes: number;
  badges: QueueTaskBadgesDto;
  assignment: {
    assignmentId: string | null;
    status: string | null;
    assignedAt: string | null;
    operator: { id: string; name: string } | null;
  };
}

export interface QueueTaskDetailDto extends QueueTaskCardDto {
  instructions: string | null;
  metadata: unknown;
  estimatedCompletionAt: string | null;
  deliveryAddress: string | null;
  configuration: unknown;
  /** Same selections as `configuration`, but labeled and flagged by relevance to this task's
   *  production step — e.g. "Lamination: Velvet" called out on a LAMINATION task. */
  configurationEntries: ConfigurationEntry[];
  sizeSnapshot: unknown;
  productSnapshot: unknown;
  artworkFiles: Array<{
    id: string;
    fileRequirementCode: string;
    fileRequirementLabel: string;
    fileUrl: string | null;
    originalName: string | null;
    approvalStatus: string;
    resubmittedAt: string | null;
  }>;
  attachments: Array<{
    id: string;
    fileRequirementCode: string;
    fileRequirementLabel: string;
    fileUrl: string | null;
    originalName: string | null;
  }>;
  previousTask: { id: string; stepCode: string; stepName: string; stepType: string; status: string } | null;
  nextTask: { id: string; stepCode: string; stepName: string; stepType: string; status: string } | null;
  workflowSteps: QueueWorkflowProgressStepDto[];
  dependencies: Array<{ id: string; dependsOnTaskId: string; dependencyType: string }>;
  timeline: Array<{
    id: string;
    eventType: string;
    title: string;
    description: string | null;
    createdAt: string;
  }>;
  comments: Array<{
    id: string;
    action: string;
    remarks: string | null;
    createdAt: string;
    performerName: string | null;
  }>;
}

export interface CursorListMeta {
  nextCursor?: string;
  hasMore: boolean;
  limit: number;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function resolveVendorName(record: QueueTaskListRecord): string {
  const customer = record.workflowInstance.order.customer;
  if (!customer) return record.workflowInstance.order.retailCustomer?.name ?? 'Retail customer';
  const business = customer.vendorProfile?.businessName?.trim();
  if (business) return business;
  return `${customer.firstName} ${customer.lastName}`.trim();
}

function resolveProductName(record: QueueTaskListRecord): string {
  const offering = record.workflowInstance.productionOrderItem.productOfferingVersion?.productOffering;
  if (offering?.displayName) return offering.displayName;
  if (offering?.name) return offering.name;
  const snap = record.workflowInstance.productionOrderItem.productSnapshot as { name?: string };
  return snap?.name ?? 'Product';
}

function buildBadges(record: QueueTaskListRecord): QueueTaskBadgesDto {
  return {
    rush: record.priority === 'URGENT' || record.priority === 'HIGH',
    rework: record.status === 'REWORK' || record.status === 'REJECTED' || record.reworks.length > 0,
    blocked: record.status === 'BLOCKED',
  };
}

function buildProgress(record: QueueTaskListRecord) {
  const steps = record.workflowInstance.tasks;
  const totalSteps = steps.length;
  const completedSteps = steps.filter((s) =>
    ['COMPLETED', 'SKIPPED'].includes(s.status),
  ).length;
  const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return {
    currentStepOrder: record.workflowInstance.currentStepOrder,
    completedSteps,
    totalSteps,
    percent,
  };
}

export function mapDepartmentListItem(record: DepartmentListItemRecord): DepartmentListItemDto {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    sortOrder: record.sortOrder,
    counts: record.counts,
  };
}

export function mapQueueTaskCard(record: QueueTaskListRecord): QueueTaskCardDto {
  const item = record.workflowInstance.productionOrderItem;
  const offering = item.productOfferingVersion?.productOffering;

  return {
    id: record.id,
    workflowInstanceId: record.workflowInstanceId,
    orderId: record.workflowInstance.order.id,
    orderNumber: record.workflowInstance.order.orderNumber,
    orderName: record.workflowInstance.order.orderName,
    vendor: {
      id: record.workflowInstance.order.customer?.id ?? record.workflowInstance.order.retailCustomer?.id ?? '',
      name: resolveVendorName(record),
      businessName: record.workflowInstance.order.customer?.vendorProfile?.businessName ?? null,
      memberCode: record.workflowInstance.order.customer?.vendorProfile?.vendorCode ?? null,
      phone:
        record.workflowInstance.order.customer?.phone ??
        record.workflowInstance.order.retailCustomer?.phone ??
        null,
      email: record.workflowInstance.order.customer?.email ?? null,
    },
    product: {
      id: offering?.id ?? null,
      name: resolveProductName(record),
      displayName: offering?.displayName ?? null,
      quantity: item.quantity,
    },
    department: record.department,
    workflowStep: record.workflowStep,
    workflowStatus: record.workflowInstance.status,
    workflowProgress: buildProgress(record),
    priority: record.priority,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    queuedAt: toIso(record.queuedAt),
    dueAt: toIso(record.dueAt),
    estimatedMinutes: record.estimatedMinutes,
    badges: buildBadges(record),
    assignment: mapQueueAssignmentSummary(record.assignments[0]),
  };
}

export function mapQueueTaskDetail(record: QueueTaskDetailRecord): QueueTaskDetailDto {
  const card = mapQueueTaskCard(record);
  const orderedSteps = record.workflowInstance.tasks;
  const currentIndex = orderedSteps.findIndex((s) => s.id === record.id);
  const previous = currentIndex > 0 ? orderedSteps[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < orderedSteps.length - 1 ? orderedSteps[currentIndex + 1] : null;

  const workflowSteps: QueueWorkflowProgressStepDto[] = orderedSteps.map((step) => {
    const isCompleted = step.status === 'COMPLETED' || step.status === 'SKIPPED';
    const isCurrent = step.id === record.id;
    return {
      id: step.id,
      stepOrder: step.stepOrder,
      stepCode: step.workflowStep.stepCode,
      stepName: step.workflowStep.stepName,
      stepType: step.workflowStep.stepType,
      status: step.status,
      isCurrent,
      isCompleted,
      isFuture: !isCompleted && !isCurrent,
      jobSlipBeforeThisStep: step.workflowStep.jobSlipBeforeThisStep,
    };
  });

  const item = record.workflowInstance.productionOrderItem;

  return {
    ...card,
    instructions: record.instructions,
    metadata: record.metadata,
    estimatedCompletionAt: toIso(record.workflowInstance.order.estimatedCompletionAt),
    deliveryAddress: record.workflowInstance.order.deliveryAddress ?? null,
    configuration: item.configurationSnapshot,
    configurationEntries: buildConfigurationEntries(
      item.productOfferingVersion?.configurationFields ?? [],
      (item.configurationSnapshot as { selections?: Record<string, unknown> } | null)?.selections,
      record.workflowStep.stepType,
    ),
    sizeSnapshot: item.sizeSnapshot,
    productSnapshot: item.productSnapshot,
    artworkFiles: item.orderArtworks.map((art) => {
      const pinned = art.pinnedVersion?.artworkVersion;
      const fileAsset = pinned?.fileAsset ?? art.artworkFile?.fileAsset;
      const mimeType = fileAsset?.mimeType ?? '';
      const extension =
        fileAsset?.originalName?.split('.').pop()?.toLowerCase() ??
        (mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : '');

      return {
        id: art.id,
        fileRequirementCode: art.fileRequirementCode,
        fileRequirementLabel: art.fileRequirementCode,
        fileUrl: fileAsset?.fileUrl ?? null,
        previewUrl: pinned?.previewUrl ?? null,
        originalName: fileAsset?.originalName ?? null,
        approvalStatus: art.approvalStatus,
        resubmittedAt: art.resubmittedAt ? art.resubmittedAt.toISOString() : null,
        artworkVersionId: pinned?.id ?? null,
        versionNumber: pinned?.versionNumber ?? null,
        extension,
        versions: (art.artworkFile?.versions ?? []).map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          previewUrl: v.previewUrl,
          fileUrl: v.fileAsset.fileUrl,
          originalName: v.fileAsset.originalName,
          extension:
            v.fileAsset.originalName?.split('.').pop()?.toLowerCase() ??
            v.fileAsset.mimeType?.split('/').pop() ??
            '',
        })),
      };
    }),
    attachments: item.files.map((file) => ({
      id: file.id,
      fileRequirementCode: file.fileRequirementCode,
      fileRequirementLabel: file.fileRequirementLabel,
      fileUrl: file.fileAsset?.fileUrl ?? null,
      originalName: file.fileAsset?.originalName ?? null,
    })),
    previousTask: previous
      ? {
          id: previous.id,
          stepCode: previous.workflowStep.stepCode,
          stepName: previous.workflowStep.stepName,
          stepType: previous.workflowStep.stepType,
          status: previous.status,
        }
      : null,
    nextTask: next
      ? {
          id: next.id,
          stepCode: next.workflowStep.stepCode,
          stepName: next.workflowStep.stepName,
          stepType: next.workflowStep.stepType,
          status: next.status,
        }
      : null,
    workflowSteps,
    dependencies: record.dependencies,
    timeline: record.workflowInstance.timelineEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      createdAt: event.createdAt.toISOString(),
    })),
    comments: record.history
      .filter((h) => h.remarks)
      .map((h) => ({
        id: h.id,
        action: h.action,
        remarks: h.remarks,
        createdAt: h.createdAt.toISOString(),
        performerName: h.performedBy
          ? `${h.performedBy.firstName} ${h.performedBy.lastName}`.trim()
          : null,
      })),
  };
}

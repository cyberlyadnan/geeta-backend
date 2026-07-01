import {
  ActivityAction,
  QualityInspectionResult,
  QualityInspectionStatus,
  WorkflowHistoryAction,
  WorkflowStepType,
  WorkflowTaskStatus,
  type Prisma,
  type RoleName,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ApiError } from '../../../common/errors/ApiError.js';
import { eventBus, APP_EVENTS } from '../../../events/eventBus.js';
import { activityLogService } from '../../../services/activity/activity-log.service.js';
import { storageService } from '../../../services/storage/storage.service.js';
import { resolveExtension, sanitizeFileName } from '../../../services/storage/storage.utils.js';
import { workflowEngine } from '../../workflow/workflow.engine.js';
import { workflowTimelineService } from '../../workflow/workflow-timeline.service.js';
import { assertTaskTransition } from '../../workflow/task-state-machine.js';
import { productionQueueCache } from '../queue/queue.cache.js';
import { assertCanInspectQc, assertCanViewQcMetrics } from './qc.access.js';
import { mapInspectionToDto } from './qc.dto.js';
import { qcRepository } from './qc.repository.js';
import type {
  AddDefectBody,
  RegisterAttachmentBody,
  SubmitInspectionBody,
  UpdateChecklistBody,
} from './qc.validation.js';

const INSPECTION_START_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.ASSIGNED,
  WorkflowTaskStatus.IN_PROGRESS,
  WorkflowTaskStatus.BLOCKED,
];

export class QcService {
  async startInspection(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    checklistTemplateId?: string,
  ) {
    const task = await qcRepository.findQcTask(taskId);
    if (!task) throw ApiError.notFound('Workflow task not found');
    if (task.workflowStep.stepType !== WorkflowStepType.QUALITY_CHECK) {
      throw ApiError.conflict('Task is not a QC inspection step');
    }

    const assignment = await qcRepository.findActiveAssignment(taskId);
    if (assignment) assertCanInspectQc(assignment.operatorId, actorId, role, permissions);
    else assertCanInspectQc(actorId, actorId, role, permissions);

    if (!INSPECTION_START_STATUSES.includes(task.status)) {
      throw ApiError.conflict(`Task cannot start QC inspection in status ${task.status}`);
    }

    const existing = await qcRepository.findActiveInspection(taskId);
    if (existing) return mapInspectionToDto(existing);

    const template = await qcRepository.resolveChecklistTemplate(task, checklistTemplateId);
    const now = new Date();

    const inspectionId = await prisma.$transaction(async (tx) => {
      if (task.status !== WorkflowTaskStatus.IN_PROGRESS) {
        assertTaskTransition(task.status, WorkflowTaskStatus.IN_PROGRESS);
        await tx.workflowTask.update({
          where: { id: taskId },
          data: { status: WorkflowTaskStatus.IN_PROGRESS, startedAt: now },
        });
        await tx.workflowTaskHistory.create({
          data: { taskId, action: WorkflowHistoryAction.STARTED, performedById: actorId },
        });
      }

      const inspection = await tx.qualityInspection.create({
        data: {
          workflowTaskId: taskId,
          workflowInstanceId: task.workflowInstanceId,
          inspectorId: actorId,
          checklistTemplateId: template?.id,
          status: QualityInspectionStatus.IN_PROGRESS,
          startedAt: now,
          items: template
            ? {
                create: template.items.map((item) => ({
                  itemCode: item.itemCode,
                  label: item.label,
                  templateItemId: item.id,
                })),
              }
            : undefined,
        },
        select: { id: true },
      });

      await workflowTimelineService.recordEvents(
        [
          workflowTimelineService.qcStarted({
            workflowInstanceId: task.workflowInstanceId,
            taskId,
            stepName: task.workflowStep.stepName,
            actorId,
          }),
        ],
        tx,
      );

      return inspection.id;
    });

    this.afterQcMutation(ActivityAction.QC_STARTED, APP_EVENTS.QC_STARTED, { taskId, inspectionId, actorId });

    const record = await qcRepository.findInspectionById(inspectionId);
    if (!record) throw ApiError.internal('Failed to load inspection');
    return mapInspectionToDto(record);
  }

  async getInspectionForTask(taskId: string) {
    const inspection = await qcRepository.findActiveInspection(taskId);
    if (inspection) return mapInspectionToDto(inspection);
    const latest = await qcRepository.findLatestInspection(taskId);
    return latest ? mapInspectionToDto(latest) : null;
  }

  async updateChecklist(
    inspectionId: string,
    body: UpdateChecklistBody,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    const inspection = await this.loadEditableInspection(inspectionId, actorId, role, permissions);

    await prisma.$transaction(async (tx) => {
      for (const item of body.items) {
        await tx.qualityInspectionItem.updateMany({
          where: { inspectionId, itemCode: item.itemCode },
          data: { passed: item.passed, remarks: item.remarks, label: item.label },
        });
      }
    });

    const record = await qcRepository.findInspectionById(inspection.id);
    if (!record) throw ApiError.internal('Inspection not found');
    return mapInspectionToDto(record);
  }

  async addDefect(
    inspectionId: string,
    body: AddDefectBody,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    const inspection = await this.loadEditableInspection(inspectionId, actorId, role, permissions);

    await prisma.qualityInspectionDefect.create({
      data: {
        inspectionId: inspection.id,
        category: body.category,
        severity: body.severity,
        description: body.description,
        remarks: body.remarks,
        fileAssetId: body.fileAssetId,
      },
    });

    const record = await qcRepository.findInspectionById(inspection.id);
    if (!record) throw ApiError.internal('Inspection not found');
    return mapInspectionToDto(record);
  }

  async addNote(
    inspectionId: string,
    text: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    const inspection = await this.loadEditableInspection(inspectionId, actorId, role, permissions);

    await prisma.qualityInspection.update({
      where: { id: inspection.id },
      data: { remarks: text },
    });

    this.afterQcMutation(ActivityAction.QC_NOTE_ADDED, APP_EVENTS.QC_NOTE_ADDED, {
      taskId: inspection.workflowTaskId,
      inspectionId: inspection.id,
      actorId,
    });

    const record = await qcRepository.findInspectionById(inspection.id);
    if (!record) throw ApiError.internal('Inspection not found');
    return mapInspectionToDto(record);
  }

  async presignAttachment(
    inspectionId: string,
    fileName: string,
    contentType: string,
    fileSize: number,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    const inspection = await this.loadEditableInspection(inspectionId, actorId, role, permissions);
    return storageService.createPresignedProductionAttachmentUpload(
      inspection.workflowTaskId,
      fileName,
      contentType,
      fileSize,
    );
  }

  async registerAttachment(
    inspectionId: string,
    body: RegisterAttachmentBody,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    const inspection = await this.loadEditableInspection(inspectionId, actorId, role, permissions);
    const ext = resolveExtension(body.mimeType, body.originalName);

    await prisma.$transaction(async (tx) => {
      const fileAsset = await tx.fileAsset.create({
        data: {
          originalName: sanitizeFileName(body.originalName),
          fileName: sanitizeFileName(body.originalName),
          fileKey: body.key,
          fileUrl: body.publicUrl,
          mimeType: body.mimeType,
          extension: ext,
          fileSize: body.fileSize,
          uploadedById: actorId,
        },
      });

      await tx.qualityInspectionAttachment.create({
        data: {
          inspectionId: inspection.id,
          fileAssetId: fileAsset.id,
          category: body.category,
          label: body.label,
          uploadedById: actorId,
        },
      });

      await workflowTimelineService.recordEvents(
        [
          {
            workflowInstanceId: inspection.workflowInstanceId,
            entityType: 'WORKFLOW_TASK',
            entityId: inspection.workflowTaskId,
            eventType: 'QC_ATTACHMENT_ADDED',
            title: 'QC attachment uploaded',
            metadata: { category: body.category },
            actorId,
          },
        ],
        tx,
      );
    });

    this.afterQcMutation(ActivityAction.QC_ATTACHMENT_ADDED, APP_EVENTS.QC_ATTACHMENT_ADDED, {
      taskId: inspection.workflowTaskId,
      inspectionId: inspection.id,
      actorId,
    });

    const record = await qcRepository.findInspectionById(inspection.id);
    if (!record) throw ApiError.internal('Inspection not found');
    return mapInspectionToDto(record);
  }

  async submitResult(
    inspectionId: string,
    body: SubmitInspectionBody,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    const inspection = await this.loadEditableInspection(inspectionId, actorId, role, permissions);
    const task = await qcRepository.findQcTask(inspection.workflowTaskId);
    if (!task) throw ApiError.notFound('Workflow task not found');

    const now = new Date();
    const durationSeconds = inspection.startedAt
      ? Math.max(0, Math.floor((now.getTime() - inspection.startedAt.getTime()) / 1000))
      : 0;

    await prisma.qualityInspection.update({
      where: { id: inspection.id },
      data: {
        status: QualityInspectionStatus.COMPLETED,
        result: body.result,
        remarks: body.remarks ?? inspection.remarks,
        completedAt: now,
        durationSeconds,
      },
    });

    const outcome = await workflowEngine.processQcOutcome({
      workflowInstanceId: inspection.workflowInstanceId,
      qcTaskId: inspection.workflowTaskId,
      result: body.result,
      actorId,
      remarks: body.remarks,
      targetTaskId: body.targetTaskId,
    });

    if (outcome.reworkRequestId) {
      await prisma.reworkRequest.update({
        where: { id: outcome.reworkRequestId },
        data: { qcInspectionId: inspection.id },
      });
    }

    const activityMap: Record<QualityInspectionResult, ActivityAction> = {
      PASS: ActivityAction.QC_PASSED,
      PASS_WITH_REMARKS: ActivityAction.QC_PASSED,
      FAIL: ActivityAction.QC_FAILED,
      ON_HOLD: ActivityAction.QC_HOLD,
      REWORK_REQUIRED: ActivityAction.REWORK_REQUESTED,
    };

    const eventMap: Record<QualityInspectionResult, (typeof APP_EVENTS)[keyof typeof APP_EVENTS]> = {
      PASS: APP_EVENTS.QC_PASSED,
      PASS_WITH_REMARKS: APP_EVENTS.QC_PASSED,
      FAIL: APP_EVENTS.QC_FAILED,
      ON_HOLD: APP_EVENTS.QC_HOLD,
      REWORK_REQUIRED: APP_EVENTS.REWORK_REQUESTED,
    };

    if (body.result === 'PASS' || body.result === 'PASS_WITH_REMARKS') {
      await prisma.$transaction(async (tx) => {
        await workflowTimelineService.recordEvents(
          [
            workflowTimelineService.qcPassed({
              workflowInstanceId: inspection.workflowInstanceId,
              taskId: inspection.workflowTaskId,
              stepName: task.workflowStep.stepName,
              actorId,
              remarks: body.remarks,
            }),
          ],
          tx,
        );
      });
    }

    this.afterQcMutation(activityMap[body.result], eventMap[body.result], {
      taskId: inspection.workflowTaskId,
      inspectionId: inspection.id,
      actorId,
      result: body.result,
      reworkTargetTaskId: outcome.reworkTargetTaskId,
    });

    const record = await qcRepository.findInspectionById(inspection.id);
    if (!record) throw ApiError.internal('Inspection not found');

    return {
      inspection: mapInspectionToDto(record),
      workflow: outcome,
    };
  }

  async listQcQueue(departmentId: string) {
    const rows = await qcRepository.listQcQueueTasks(departmentId);
    return {
      items: rows.map((row) => ({
        taskId: row.id,
        status: row.status,
        priority: row.priority,
        dueAt: row.dueAt?.toISOString() ?? null,
        orderNumber: row.workflowInstance.order.orderNumber,
        orderName: row.workflowInstance.order.orderName,
        step: row.workflowStep,
        operator: row.assignments[0]?.operator
          ? {
              id: row.assignments[0].operator.id,
              name: `${row.assignments[0].operator.firstName} ${row.assignments[0].operator.lastName}`.trim(),
            }
          : null,
      })),
    };
  }

  async getMetrics(departmentId: string | undefined, role: RoleName, permissions: string[]) {
    assertCanViewQcMetrics(role, permissions);
    return qcRepository.getMetrics(departmentId);
  }

  private async loadEditableInspection(
    inspectionId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    const inspection = await qcRepository.findInspectionById(inspectionId);
    if (!inspection) throw ApiError.notFound('Inspection not found');
    if (inspection.status !== QualityInspectionStatus.IN_PROGRESS) {
      throw ApiError.conflict('Inspection is not editable');
    }
    assertCanInspectQc(inspection.inspectorId, actorId, role, permissions);
    return inspection;
  }

  private afterQcMutation(
    action: ActivityAction,
    event: (typeof APP_EVENTS)[keyof typeof APP_EVENTS],
    payload: Record<string, unknown>,
  ) {
    activityLogService.logAsync({
      action,
      entityType: 'quality_inspection',
      entityId: String(payload['inspectionId'] ?? payload['taskId']),
      actorId: payload['actorId'] as string | undefined,
      metadata: payload as Prisma.InputJsonValue,
    });
    eventBus.emitEvent(event, payload);
    void productionQueueCache.invalidateAll();
  }
}

export const qcService = new QcService();

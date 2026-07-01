import {
  Prisma,
  QualityInspectionResult,
  QualityInspectionStatus,
  WorkflowStepType,
  WorkflowTaskAssignmentStatus,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';

export const INSPECTION_SELECT = {
  id: true,
  workflowTaskId: true,
  workflowInstanceId: true,
  inspectorId: true,
  checklistTemplateId: true,
  status: true,
  result: true,
  remarks: true,
  reworkCycle: true,
  startedAt: true,
  completedAt: true,
  durationSeconds: true,
  createdAt: true,
  updatedAt: true,
  inspector: { select: { id: true, firstName: true, lastName: true, email: true } },
  items: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      itemCode: true,
      label: true,
      passed: true,
      remarks: true,
    },
  },
  defects: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      category: true,
      severity: true,
      description: true,
      remarks: true,
      createdAt: true,
      fileAsset: { select: { id: true, originalName: true, fileUrl: true, mimeType: true } },
    },
  },
  attachments: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      category: true,
      label: true,
      createdAt: true,
      fileAsset: { select: { id: true, originalName: true, fileUrl: true, mimeType: true, fileSize: true } },
    },
  },
} satisfies Prisma.QualityInspectionSelect;

export type InspectionRecord = Prisma.QualityInspectionGetPayload<{ select: typeof INSPECTION_SELECT }>;

export const QC_TASK_SELECT = {
  id: true,
  workflowInstanceId: true,
  departmentId: true,
  status: true,
  stepOrder: true,
  instructions: true,
  workflowStep: { select: { id: true, stepCode: true, stepName: true, stepType: true, metadata: true } },
  workflowInstance: {
    select: {
      id: true,
      order: { select: { orderNumber: true, orderName: true } },
      productionOrderItem: {
        select: {
          productOfferingVersion: {
            select: {
              id: true,
              productOffering: { select: { name: true, displayName: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.WorkflowTaskSelect;

export class QcRepository {
  findQcTask(taskId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowTask.findUnique({
      where: { id: taskId },
      select: QC_TASK_SELECT,
    });
  }

  findActiveAssignment(taskId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowTaskAssignment.findFirst({
      where: { workflowTaskId: taskId, status: WorkflowTaskAssignmentStatus.ACTIVE },
      select: { id: true, operatorId: true },
    });
  }

  findActiveInspection(taskId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.qualityInspection.findFirst({
      where: {
        workflowTaskId: taskId,
        status: { in: [QualityInspectionStatus.DRAFT, QualityInspectionStatus.IN_PROGRESS] },
      },
      select: INSPECTION_SELECT,
    });
  }

  findInspectionById(inspectionId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.qualityInspection.findUnique({
      where: { id: inspectionId },
      select: INSPECTION_SELECT,
    });
  }

  findLatestInspection(taskId: string) {
    return prisma.qualityInspection.findFirst({
      where: { workflowTaskId: taskId },
      orderBy: { createdAt: 'desc' },
      select: INSPECTION_SELECT,
    });
  }

  resolveChecklistTemplate(task: {
    workflowStep: { id: string };
    workflowInstance: { productionOrderItem: { productOfferingVersion: { id: string } | null } | null };
  }, explicitTemplateId?: string) {
    if (explicitTemplateId) {
      return prisma.qualityChecklistTemplate.findUnique({
        where: { id: explicitTemplateId },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    }
    return prisma.qualityChecklistTemplate.findFirst({
      where: {
        isActive: true,
        OR: [
          { workflowTemplateStepId: task.workflowStep.id },
          {
            productOfferingVersionId:
              task.workflowInstance.productionOrderItem?.productOfferingVersion?.id ?? undefined,
          },
        ],
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  listQcQueueTasks(departmentId: string, limit = 50) {
    return prisma.workflowTask.findMany({
      where: {
        departmentId,
        workflowStep: { stepType: WorkflowStepType.QUALITY_CHECK },
        status: { in: ['READY', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'BLOCKED'] },
      },
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { stepOrder: 'asc' }],
      take: limit,
      select: {
        id: true,
        status: true,
        priority: true,
        dueAt: true,
        workflowStep: { select: { stepName: true, stepCode: true } },
        workflowInstance: { select: { order: { select: { orderNumber: true, orderName: true } } } },
        assignments: {
          where: { status: WorkflowTaskAssignmentStatus.ACTIVE },
          take: 1,
          select: { operator: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
  }

  async getMetrics(departmentId?: string) {
    const taskFilter = departmentId
      ? { workflowTask: { departmentId, workflowStep: { stepType: WorkflowStepType.QUALITY_CHECK } } }
      : { workflowTask: { workflowStep: { stepType: WorkflowStepType.QUALITY_CHECK } } };

    const [pending, failed, reworkOpen, completed, passCount, failCount, avgDuration] =
      await Promise.all([
        prisma.qualityInspection.count({
          where: { ...taskFilter, status: QualityInspectionStatus.IN_PROGRESS },
        }),
        prisma.qualityInspection.count({
          where: {
            ...taskFilter,
            status: QualityInspectionStatus.COMPLETED,
            result: { in: [QualityInspectionResult.FAIL, QualityInspectionResult.REWORK_REQUIRED] },
          },
        }),
        prisma.reworkRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        prisma.qualityInspection.count({
          where: { ...taskFilter, status: QualityInspectionStatus.COMPLETED },
        }),
        prisma.qualityInspection.count({
          where: {
            ...taskFilter,
            status: QualityInspectionStatus.COMPLETED,
            result: { in: [QualityInspectionResult.PASS, QualityInspectionResult.PASS_WITH_REMARKS] },
          },
        }),
        prisma.qualityInspection.count({
          where: {
            ...taskFilter,
            status: QualityInspectionStatus.COMPLETED,
            result: { in: [QualityInspectionResult.FAIL, QualityInspectionResult.REWORK_REQUIRED] },
          },
        }),
        prisma.qualityInspection.aggregate({
          where: { ...taskFilter, status: QualityInspectionStatus.COMPLETED },
          _avg: { durationSeconds: true },
        }),
      ]);

    const passRate = completed > 0 ? Math.round((passCount / completed) * 100) : 0;

    return {
      pendingQc: pending,
      failedQc: failed,
      openRework: reworkOpen,
      completedInspections: completed,
      passRate,
      averageQcTimeSeconds: Math.round(avgDuration._avg.durationSeconds ?? 0),
      passCount,
      failCount,
    };
  }
}

export const qcRepository = new QcRepository();

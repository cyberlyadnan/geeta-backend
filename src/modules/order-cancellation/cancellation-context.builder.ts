import { WorkflowTaskAssignmentStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';

/**
 * Lightweight snapshot for cancellation review — avoids heavy production context map.
 */
export async function buildCancellationContextSnapshot(orderId: string) {
  const [order, workflow, orderEvents, artworks] = await Promise.all([
    prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        items: {
          take: 1,
          select: {
            quantity: true,
            productSnapshot: true,
          },
        },
      },
    }),
    prisma.workflowInstance.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        currentStepOrder: true,
        tasks: {
          orderBy: { stepOrder: 'asc' },
          select: {
            id: true,
            status: true,
            stepOrder: true,
            department: { select: { id: true, code: true, name: true } },
            workflowStep: { select: { stepCode: true, stepName: true, stepType: true } },
            assignedMachine: {
              select: { id: true, machineCode: true, machineName: true },
            },
            assignments: {
              where: { status: WorkflowTaskAssignmentStatus.ACTIVE },
              take: 1,
              select: {
                operator: { select: { id: true, firstName: true, lastName: true } },
                machine: { select: { id: true, machineCode: true, machineName: true } },
              },
            },
          },
        },
      },
    }),
    prisma.productionOrderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        eventType: true,
        title: true,
        createdAt: true,
      },
    }),
    prisma.orderArtwork.findMany({
      where: { orderItem: { orderId } },
      select: {
        approvalStatus: true,
        fileRequirementCode: true,
      },
    }),
  ]);

  const tasks = workflow?.tasks ?? [];
  const activeStatuses = new Set(['READY', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'ON_HOLD', 'WAITING']);
  const currentTask =
    tasks.find((t) => activeStatuses.has(t.status)) ??
    tasks.find((t) => !['COMPLETED', 'CANCELLED', 'SKIPPED'].includes(t.status)) ??
    null;

  const operator = currentTask?.assignments?.[0]?.operator;
  const machine =
    currentTask?.assignments?.[0]?.machine ?? currentTask?.assignedMachine ?? null;

  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const totalTasks = tasks.length;
  const item = order?.items[0];
  const productSnapshot = (item?.productSnapshot ?? {}) as Record<string, unknown>;

  return {
    capturedAt: new Date().toISOString(),
    orderNumber: order?.orderNumber ?? null,
    orderStatus: order?.status ?? null,
    currentWorkflowStep: currentTask
      ? {
          stepCode: currentTask.workflowStep.stepCode,
          stepName: currentTask.workflowStep.stepName,
          stepType: currentTask.workflowStep.stepType,
          status: currentTask.status,
        }
      : null,
    currentDepartment: currentTask?.department
      ? {
          id: currentTask.department.id,
          code: currentTask.department.code,
          name: currentTask.department.name,
        }
      : null,
    assignedOperator: operator
      ? {
          id: operator.id,
          name: `${operator.firstName} ${operator.lastName}`.trim(),
        }
      : null,
    assignedMachine: machine
      ? {
          id: machine.id,
          code: machine.machineCode,
          name: machine.machineName,
        }
      : null,
    artworkStatus: artworks.map((a) => ({
      requirementCode: a.fileRequirementCode,
      approvalStatus: a.approvalStatus,
    })),
    productionProgress: {
      workflowStatus: workflow?.status ?? null,
      completedTasks,
      totalTasks,
      percentComplete: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      reworkCount: 0,
      qcFailed: false,
    },
    timelineSummary: orderEvents.map((e) => ({
      eventType: e.eventType,
      title: e.title,
      createdAt: e.createdAt.toISOString(),
    })),
    estimatedMaterialConsumption: {
      quantity: item?.quantity ?? null,
      productName:
        (productSnapshot['name'] as string) ??
        (productSnapshot['displayName'] as string) ??
        null,
      note: 'Material consumption estimate — integrate with inventory engine in future.',
    },
  };
}

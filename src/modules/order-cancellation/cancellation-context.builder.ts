import { prisma } from '../../config/database.js';
import { productionOrderRepository } from '../production/orders/production-order.repository.js';

export async function buildCancellationContextSnapshot(orderId: string) {
  const [order, contextMap, orderEvents, artworks] = await Promise.all([
    prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        subtotal: true,
        totalAmount: true,
        items: {
          take: 1,
          select: {
            id: true,
            quantity: true,
            productSnapshot: true,
            orderArtworks: {
              select: {
                approvalStatus: true,
                fileRequirementCode: true,
              },
            },
          },
        },
      },
    }),
    productionOrderRepository.fetchOrderContextMap([orderId]),
    prisma.productionOrderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      take: 10,
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

  const context = contextMap.get(orderId);
  const currentTask = context?.currentTask;
  const operator = currentTask?.assignments?.[0]?.operator;
  const machine =
    currentTask?.assignments?.[0]?.machine ?? currentTask?.assignedMachine ?? null;

  const workflowInstances = await prisma.workflowInstance.findMany({
    where: { orderId },
    select: {
      id: true,
      status: true,
      tasks: {
        select: { status: true },
      },
    },
  });

  const allTasks = workflowInstances.flatMap((w) => w.tasks);
  const completedTasks = allTasks.filter((t) => t.status === 'COMPLETED').length;
  const totalTasks = allTasks.length;

  const item = order?.items[0];
  const productSnapshot = (item?.productSnapshot ?? {}) as Record<string, unknown>;

  return {
    capturedAt: new Date().toISOString(),
    orderNumber: order?.orderNumber,
    orderStatus: order?.status,
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
          code: 'machineCode' in machine ? machine.machineCode : null,
          name: 'machineName' in machine ? machine.machineName : null,
        }
      : null,
    artworkStatus: artworks.map((a) => ({
      requirementCode: a.fileRequirementCode,
      approvalStatus: a.approvalStatus,
    })),
    productionProgress: {
      workflowStatus: context?.workflowStatus ?? null,
      completedTasks,
      totalTasks,
      percentComplete: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      reworkCount: context?.reworkCount ?? 0,
      qcFailed: context?.qcFailed ?? false,
    },
    timelineSummary: orderEvents.map((e) => ({
      eventType: e.eventType,
      title: e.title,
      createdAt: e.createdAt.toISOString(),
    })),
    estimatedMaterialConsumption: {
      quantity: item?.quantity ?? null,
      productName: (productSnapshot['name'] as string) ?? (productSnapshot['displayName'] as string) ?? null,
      note: 'Material consumption estimate — integrate with inventory engine in future.',
    },
  };
}

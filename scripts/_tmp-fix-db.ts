import { PrismaClient, ProductionOrderStatus, WorkflowStepType, WorkflowTaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

const STEP_TYPE_TO_ORDER_STATUS: Partial<Record<WorkflowStepType, ProductionOrderStatus>> = {
  [WorkflowStepType.VERIFICATION]: ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
  [WorkflowStepType.VENDOR_APPROVAL]: ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
  [WorkflowStepType.PRINTING]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.LAMINATION]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.UV]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.FOILING]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.DIE_CUTTING]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.PACKAGING]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.CUSTOM]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.QUALITY_CHECK]: ProductionOrderStatus.QUALITY_CHECK,
  [WorkflowStepType.DISPATCH]: ProductionOrderStatus.READY_FOR_DISPATCH,
};

const STATUS_RANK: Record<string, number> = {
  [ProductionOrderStatus.ORDER_PLACED]: 0,
  [ProductionOrderStatus.PENDING_PAYMENT]: 1,
  [ProductionOrderStatus.UNDER_ARTWORK_REVIEW]: 2,
  [ProductionOrderStatus.ARTWORK_APPROVED]: 3,
  [ProductionOrderStatus.CONFIRMED]: 4,
  [ProductionOrderStatus.IN_PRODUCTION]: 5,
  [ProductionOrderStatus.QUALITY_CHECK]: 6,
  [ProductionOrderStatus.READY_FOR_DISPATCH]: 7,
};

const SYNCABLE = new Set([
  ProductionOrderStatus.ORDER_PLACED,
  ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
  ProductionOrderStatus.ARTWORK_APPROVED,
  ProductionOrderStatus.CONFIRMED,
  ProductionOrderStatus.IN_PRODUCTION,
  ProductionOrderStatus.QUALITY_CHECK,
]);

async function main() {
  const orders = await prisma.productionOrder.findMany({
    where: { status: { in: [...SYNCABLE] } },
    select: { id: true, orderNumber: true, status: true },
  });

  console.log(`Found ${orders.length} orders to check`);

  for (const order of orders) {
    const activeTasks = await prisma.workflowTask.findMany({
      where: {
        workflowInstance: { orderId: order.id },
        status: { in: [WorkflowTaskStatus.READY, WorkflowTaskStatus.ASSIGNED, WorkflowTaskStatus.IN_PROGRESS, WorkflowTaskStatus.REWORK] },
      },
      select: { workflowStep: { select: { stepType: true } } },
    });

    if (activeTasks.length === 0) continue;

    let highestStatus: ProductionOrderStatus | null = null;
    let highestRank = -1;
    for (const task of activeTasks) {
      const mapped = STEP_TYPE_TO_ORDER_STATUS[task.workflowStep.stepType];
      if (!mapped) continue;
      const rank = STATUS_RANK[mapped] ?? -1;
      if (rank > highestRank) {
        highestRank = rank;
        highestStatus = mapped;
      }
    }

    if (!highestStatus) continue;
    const currentRank = STATUS_RANK[order.status] ?? -1;
    if (highestRank <= currentRank) continue;

    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { status: highestStatus },
    });

    console.log(`Order #${order.orderNumber}: ${order.status} → ${highestStatus}`);
  }

  console.log('Done');
}

main().catch(console.error).finally(() => prisma.$disconnect());

import {
  DeliveryStatus,
  DeliveryType,
  ProductionOrderStatus,
  WorkflowInstanceStatus,
  WorkflowPriority,
  WorkflowTaskStatus,
} from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';
import { workflowEngine } from '../../../src/modules/workflow/workflow.engine.js';
import {
  assignTaskToOperator,
  completeTask,
  findSeededUserId,
  setTaskInProgress,
  type OrderSeedScenario,
} from './users.seed.js';

const SEED_ORDERS: OrderSeedScenario[] = [
  {
    orderNumber: '000001',
    orderName: 'Visiting Cards — Standard Run',
    productSlug: '350-gsm-visiting-card-matt',
    quantity: 1000,
    status: ProductionOrderStatus.IN_PRODUCTION,
    scenario: 'in_production',
  },
  {
    orderNumber: '000002',
    orderName: '8 Page Booklet — Completed',
    productSlug: '8-page-booklet',
    quantity: 500,
    status: ProductionOrderStatus.COMPLETED,
    scenario: 'completed',
  },
  {
    orderNumber: '000003',
    orderName: 'Star Flex Banner — QC',
    productSlug: 'star-flex-banner',
    quantity: 1,
    status: ProductionOrderStatus.QUALITY_CHECK,
    scenario: 'qc',
  },
  {
    orderNumber: '000004',
    orderName: 'Folding Carton — Ready for Dispatch',
    productSlug: 'folding-carton',
    quantity: 500,
    status: ProductionOrderStatus.READY_FOR_DISPATCH,
    scenario: 'dispatch_ready',
  },
  {
    orderNumber: '000005',
    orderName: 'Acrylic Photo Print — Dispatched',
    productSlug: 'acrylic-photo-print',
    quantity: 10,
    status: ProductionOrderStatus.DISPATCHED,
    scenario: 'completed',
  },
  {
    orderNumber: '000006',
    orderName: 'Gold Foil Cards — Rework',
    productSlug: 'gold-foil-visiting-card',
    quantity: 1000,
    status: ProductionOrderStatus.IN_PRODUCTION,
    scenario: 'rework',
  },
  {
    orderNumber: '000007',
    orderName: 'Corporate Brochure — On Hold',
    productSlug: 'corporate-brochure',
    quantity: 250,
    status: ProductionOrderStatus.ON_HOLD,
    scenario: 'on_hold',
  },
  {
    orderNumber: '000008',
    orderName: 'A4 Flyer — Rush & Delayed',
    productSlug: 'a4-flyer',
    quantity: 5000,
    status: ProductionOrderStatus.IN_PRODUCTION,
    priority: WorkflowPriority.URGENT,
    scenario: 'rush_delayed',
  },
  {
    orderNumber: '000009',
    orderName: 'Premium PVC Card — Artwork Review',
    productSlug: 'premium-pvc-visiting-card',
    quantity: 500,
    status: ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
    scenario: 'artwork',
  },
  {
    orderNumber: '000010',
    orderName: 'Tri-Fold Brochure — Packing',
    productSlug: 'tri-fold-brochure',
    quantity: 1000,
    status: ProductionOrderStatus.IN_PRODUCTION,
    scenario: 'packing',
  },
];

async function findTaskByStepCode(
  prisma: SeedContext['prisma'],
  workflowInstanceId: string,
  stepCode: string,
) {
  return prisma.workflowTask.findFirst({
    where: { workflowInstanceId, workflowStep: { stepCode } },
    select: { id: true, status: true, stepOrder: true },
  });
}

async function advanceThrough(
  prisma: SeedContext['prisma'],
  workflowInstanceId: string,
  throughStepCode: string,
  actorId?: string,
) {
  const tasks = await prisma.workflowTask.findMany({
    where: { workflowInstanceId },
    orderBy: { stepOrder: 'asc' },
    include: { workflowStep: { select: { stepCode: true } } },
  });

  for (const task of tasks) {
    if (task.status === WorkflowTaskStatus.COMPLETED || task.status === WorkflowTaskStatus.SKIPPED) {
      if (task.workflowStep.stepCode === throughStepCode) break;
      continue;
    }

    if (task.status === WorkflowTaskStatus.BLOCKED || task.status === WorkflowTaskStatus.WAITING) {
      await prisma.workflowTask.update({
        where: { id: task.id },
        data: { status: WorkflowTaskStatus.READY, queuedAt: new Date() },
      });
    }

    try {
      await workflowEngine.advance({
        workflowInstanceId,
        taskId: task.id,
        action: 'complete',
        actorId,
      });
    } catch {
      await completeTask(prisma, task.id, actorId);
    }

    if (task.workflowStep.stepCode === throughStepCode) break;
  }
}

async function applyScenario(
  ctx: SeedContext,
  workflowInstanceId: string,
  scenario: OrderSeedScenario['scenario'],
  priority?: WorkflowPriority,
  actorId?: string,
) {
  const { prisma } = ctx;

  if (priority) {
    await prisma.workflowTask.updateMany({
      where: { workflowInstanceId },
      data: { priority },
    });
  }

  switch (scenario) {
    case 'artwork': {
      const task = await findTaskByStepCode(prisma, workflowInstanceId, 'ARTWORK_VERIFICATION');
      if (task) {
        await assignTaskToOperator(prisma, task.id, 'artwork@geetaprint.com', { actorId });
        await setTaskInProgress(prisma, task.id, 'artwork@geetaprint.com');
      }
      break;
    }
    case 'in_production': {
      await advanceThrough(prisma, workflowInstanceId, 'ARTWORK_VERIFICATION', actorId);
      const printStep = await findTaskByStepCode(prisma, workflowInstanceId, 'DIGITAL_PRINTING')
        ?? await findTaskByStepCode(prisma, workflowInstanceId, 'OFFSET_PRINTING')
        ?? await findTaskByStepCode(prisma, workflowInstanceId, 'LARGE_FORMAT_PRINT');
      if (printStep) {
        await assignTaskToOperator(prisma, printStep.id, 'digital@geetaprint.com', {
          machineCode: 'DIG-001',
          actorId,
        });
        await setTaskInProgress(prisma, printStep.id, 'digital@geetaprint.com');
      }
      break;
    }
    case 'qc': {
      await advanceThrough(prisma, workflowInstanceId, 'DIGITAL_PRINTING', actorId)
        .catch(() => advanceThrough(prisma, workflowInstanceId, 'LARGE_FORMAT_PRINT', actorId));
      const qc = await findTaskByStepCode(prisma, workflowInstanceId, 'QUALITY_CHECK');
      if (qc) {
        await prisma.workflowTask.update({
          where: { id: qc.id },
          data: { status: WorkflowTaskStatus.IN_PROGRESS, startedAt: new Date() },
        });
        await assignTaskToOperator(prisma, qc.id, 'qc@geetaprint.com', { actorId });
      }
      break;
    }
    case 'packing': {
      await advanceThrough(prisma, workflowInstanceId, 'QUALITY_CHECK', actorId);
      const packing = await findTaskByStepCode(prisma, workflowInstanceId, 'PACKING');
      if (packing) {
        await assignTaskToOperator(prisma, packing.id, 'packing@geetaprint.com', { actorId });
        await setTaskInProgress(prisma, packing.id, 'packing@geetaprint.com');
      }
      break;
    }
    case 'dispatch_ready': {
      await advanceThrough(prisma, workflowInstanceId, 'PACKING', actorId);
      const dispatch = await findTaskByStepCode(prisma, workflowInstanceId, 'DISPATCH');
      if (dispatch) {
        await assignTaskToOperator(prisma, dispatch.id, 'dispatch@geetaprint.com', { actorId });
      }
      break;
    }
    case 'completed': {
      await advanceThrough(prisma, workflowInstanceId, 'DISPATCH', actorId);
      await prisma.workflowInstance.update({
        where: { id: workflowInstanceId },
        data: { status: WorkflowInstanceStatus.COMPLETED, completedAt: new Date() },
      });
      break;
    }
    case 'on_hold': {
      await advanceThrough(prisma, workflowInstanceId, 'ARTWORK_VERIFICATION', actorId);
      const active = await prisma.workflowTask.findFirst({
        where: {
          workflowInstanceId,
          status: { in: [WorkflowTaskStatus.READY, WorkflowTaskStatus.ASSIGNED, WorkflowTaskStatus.IN_PROGRESS] },
        },
        orderBy: { stepOrder: 'asc' },
      });
      if (active) {
        await prisma.workflowTask.update({
          where: { id: active.id },
          data: { status: WorkflowTaskStatus.ON_HOLD },
        });
      }
      break;
    }
    case 'rework': {
      await advanceThrough(prisma, workflowInstanceId, 'FOIL_STAMPING', actorId)
        .catch(() => advanceThrough(prisma, workflowInstanceId, 'DIGITAL_PRINTING', actorId));
      const printTask = await findTaskByStepCode(prisma, workflowInstanceId, 'FOIL_STAMPING')
        ?? await findTaskByStepCode(prisma, workflowInstanceId, 'DIGITAL_PRINTING');
      if (printTask) {
        await prisma.workflowTask.update({
          where: { id: printTask.id },
          data: { status: WorkflowTaskStatus.REWORK, priority: WorkflowPriority.HIGH },
        });
      }
      break;
    }
    case 'rush_delayed': {
      const pastDue = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await advanceThrough(prisma, workflowInstanceId, 'ARTWORK_VERIFICATION', actorId);
      const print = await findTaskByStepCode(prisma, workflowInstanceId, 'DIGITAL_PRINTING');
      if (print) {
        await prisma.workflowTask.update({
          where: { id: print.id },
          data: {
            status: WorkflowTaskStatus.IN_PROGRESS,
            priority: WorkflowPriority.URGENT,
            dueAt: pastDue,
            startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          },
        });
        await assignTaskToOperator(prisma, print.id, 'digital@geetaprint.com', {
          priority: WorkflowPriority.URGENT,
          machineCode: 'DIG-002',
          actorId,
        });
      }
      break;
    }
    default:
      break;
  }
}

export async function seedOrders(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('orders');
  const { prisma, actorId } = ctx;

  const vendorId = await findSeededUserId(prisma, 'vendor@geetaprint.com');
  if (!vendorId) {
    log.warn('Vendor user missing — skip orders seed');
    return;
  }

  let created = 0;

  for (const def of SEED_ORDERS) {
    const existing = await prisma.productionOrder.findUnique({ where: { orderNumber: def.orderNumber } });
    if (existing) {
      log.info(`Order ${def.orderNumber} already exists — skip`);
      continue;
    }

    const product = await prisma.productOffering.findUnique({
      where: { slug: def.productSlug },
      select: {
        id: true,
        name: true,
        versions: {
          where: { isCurrent: true, status: 'ACTIVE', deletedAt: null },
          take: 1,
          select: { id: true },
        },
      },
    });

    const versionId = product?.versions[0]?.id;
    if (!versionId) {
      log.warn(`Product ${def.productSlug} not found — skip order ${def.orderNumber}`);
      continue;
    }

    const unitPrice = 2.5;
    const subtotal = unitPrice * def.quantity;
    const taxAmount = subtotal * 0.18;
    const totalAmount = subtotal + taxAmount;

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.create({
        data: {
          orderNumber: def.orderNumber,
          customerId: vendorId,
          orderName: def.orderName,
          status: def.status,
          subtotal,
          taxAmount,
          totalAmount,
          deliveryCharge: 0,
          deliveryRequired: def.scenario !== 'completed',
          deliveryType: DeliveryType.DELIVERY,
          deliveryAddress: 'Shop 14, CG Road, Ahmedabad, Gujarat 380001',
          deliveryStatus: def.scenario === 'completed' ? DeliveryStatus.DELIVERED : DeliveryStatus.PENDING,
          walletDeducted: true,
          estimatedCompletionAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          notes: `Seed order for E2E testing — scenario: ${def.scenario}`,
          items: {
            create: {
              productOfferingVersionId: versionId,
              quantity: def.quantity,
              unitPrice,
              totalPrice: subtotal,
              productSnapshot: { name: product?.name, slug: def.productSlug },
              configurationSnapshot: {},
            },
          },
        },
        include: { items: true },
      });

      const item = order.items[0]!;
      const workflow = await workflowEngine.createForProductionOrder(
        {
          orderId: order.id,
          productionOrderItemId: item.id,
          productOfferingVersionId: versionId,
          createdById: actorId ?? vendorId,
          metadata: { orderNumber: def.orderNumber, seed: true },
        },
        tx,
      );

      await tx.productionOrderEvent.create({
        data: {
          orderId: order.id,
          eventType: 'ORDER_CREATED',
          title: 'Seed order created',
          description: `${def.orderName} seeded for testing`,
          actorId: actorId ?? vendorId,
        },
      });

      return { orderId: order.id, workflowInstanceId: workflow.workflowInstanceId };
    });

    await applyScenario(ctx, result.workflowInstanceId, def.scenario, def.priority, actorId ?? vendorId);

    if (def.scenario === 'completed' || def.scenario === 'dispatch_ready') {
      await prisma.productionOrder.update({
        where: { id: result.orderId },
        data: { status: def.status },
      });
    }

    created += 1;
  }

  log.info(`Seeded ${created} test production orders`);
}

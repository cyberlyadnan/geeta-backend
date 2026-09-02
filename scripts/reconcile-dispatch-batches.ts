/**
 * One-shot: book READY_FOR_DISPATCH orders that never landed in a batch.
 * Safe to re-run — assignToShift is idempotent.
 */
import { ProductionOrderStatus, PrismaClient } from '@prisma/client';
import { dispatchReadinessService } from '../src/modules/dispatch/dispatch-readiness.service.js';

const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.productionOrder.findMany({
    where: {
      deliveryRequired: true,
      dispatchBatchOrder: null,
      OR: [
        { status: ProductionOrderStatus.READY_FOR_DISPATCH },
        {
          workflowInstances: {
            some: {
              tasks: {
                some: {
                  status: { in: ['READY', 'ASSIGNED', 'IN_PROGRESS'] },
                  workflowStep: {
                    OR: [
                      { stepType: 'DISPATCH' },
                      { stepCode: { contains: 'DISPATCH', mode: 'insensitive' } },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
    },
    select: { id: true, orderNumber: true, status: true },
  });

  console.log(`Reconciling ${orders.length} unbatched order(s)...`);
  for (const order of orders) {
    const outcome = await dispatchReadinessService.evaluateOrder(order.id);
    console.log(order.orderNumber, order.status, '→', outcome);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

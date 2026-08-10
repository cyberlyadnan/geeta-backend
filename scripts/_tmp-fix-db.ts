import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.productionOrder.updateMany({
    where: { id: 'cmsmz72ma000ikx4vtntbwrgl' },
    data: { status: 'READY_FOR_DISPATCH' },
  });
  
  await prisma.workflowInstance.updateMany({
    where: { orderId: 'cmsmz72ma000ikx4vtntbwrgl' },
    data: { currentStepOrder: 7 },
  });

  const { dispatchReadinessService } = await import('../src/modules/dispatch/dispatch-readiness.service.js');
  const result = await dispatchReadinessService.evaluateOrder('cmsmz72ma000ikx4vtntbwrgl');
  console.log("Evaluate Order Result:", result);
}

main().catch(console.error).finally(() => prisma.$disconnect());

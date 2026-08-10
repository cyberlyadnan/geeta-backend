import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const instances = await prisma.workflowInstance.findMany({
    where: { orderId: 'cmsmz72ma000ikx4vtntbwrgl' },
    include: {
      tasks: {
        include: { workflowStep: true },
        orderBy: { stepOrder: 'asc' }
      },
    },
  });

  console.log("All Tasks for the order:", JSON.stringify(instances, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const dispatchTasks = await prisma.workflowTask.findMany({
    where: {
      status: { in: ['READY', 'ASSIGNED', 'IN_PROGRESS'] },
      workflowStep: {
        OR: [
          { stepType: 'DISPATCH' },
          { stepCode: 'DISPATCH' },
        ],
      },
    },
    include: {
      workflowInstance: {
        include: {
          order: {
            include: { dispatchBatchOrder: true }
          }
        }
      }
    }
  });
  
  console.log("Outstanding Dispatch Tasks:", JSON.stringify(dispatchTasks, null, 2));

  if (dispatchTasks.length > 0) {
    const orderId = dispatchTasks[0].workflowInstance.orderId;
    const instances = await prisma.workflowInstance.findMany({
      where: { orderId },
      include: {
        tasks: {
          where: {
            status: { in: ['READY', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD'] },
          },
          include: { workflowStep: true },
        },
      },
    });

    console.log("Workflow Instances for the order:", JSON.stringify(instances, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

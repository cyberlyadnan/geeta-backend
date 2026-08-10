import { prisma } from '../src/config/database.js';
async function main() {
  const poi = await prisma.productionOrderItem.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { productSnapshot: true, sizeSnapshot: true, configurationSnapshot: true, quantity: true,
      configurations: true,
      order: { select: { orderNumber: true } } },
  });
  console.log('Order:', poi?.order.orderNumber, 'qty:', poi?.quantity);
  console.log('configurationSnapshot:', JSON.stringify(poi?.configurationSnapshot, null, 2));
  console.log('sizeSnapshot:', JSON.stringify(poi?.sizeSnapshot, null, 2));
  console.log('configurations count:', poi?.configurations?.length);
  if (poi?.configurations?.length) console.log('configs:', JSON.stringify(poi.configurations.slice(0,3), null, 2));
}
main().finally(() => prisma.$disconnect());

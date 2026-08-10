import { prisma } from '../src/config/database.js';
import { ordersService } from '../src/modules/orders/orders.service.js';
import { walletLedgerService } from '../src/services/ledger/wallet-ledger.service.js';

const log = (s: string) => console.log(`>> ${s}`);

async function main() {
  const vendor = await prisma.user.findFirst({ where: { role: { name: 'VENDOR' } }, select: { id: true, email: true } });
  if (!vendor) throw new Error('no vendor');
  const version = await prisma.productOfferingVersion.findFirst({
    where: { isCurrent: true, productOffering: { deletedAt: null, status: 'ACTIVE' } },
    select: { id: true, productOfferingId: true, productOffering: { select: { name: true } } },
  });
  if (!version) throw new Error('no active product');
  log(`vendor=${vendor.email}  product=${version.productOffering.name}`);

  // Ensure wallet can cover the order.
  const w = await walletLedgerService.getWalletSummary(vendor.id);
  log(`wallet balance = Rs${w.balance}`);
  if (w.balance < 5000) {
    await walletLedgerService.creditWallet({
      userId: vendor.id, amount: 20000, type: 'ADJUSTMENT',
      remarks: 'E2E flow test top-up', auditAction: 'WALLET_CREDIT', auditActorId: vendor.id,
      referenceNumber: `E2E-${Date.now()}`,
      financialEvent: { eventType: 'WALLET_ADMIN_CREDIT', referenceType: 'WALLET_ADJUSTMENT', referenceId: 'e2e', createdByUserId: vendor.id },
    } as never);
    log('topped wallet up by Rs20000');
  }

  const selections = { gsm: '170', sheet_size: '13x19', print_side: 'single_side', Lamination: 'none', cutting: 'none' };
  const preview = await ordersService.preview({ type: 'vendor', vendorUserId: vendor.id },
    { versionId: version.id, quantity: 20, selections, fileOption: 'email' } as never);
  log(`preview OK  product=Rs${preview.productTotal}  payable=Rs${preview.totals.grandTotal}`);

  const order = await ordersService.create({ type: 'vendor', vendorUserId: vendor.id },
    { productId: version.productOfferingId, versionId: version.id, orderName: 'E2E flow test',
      quantity: 20, selections, fileOption: 'email' } as never);
  log(`ORDER CREATED  ${order.orderNumber}  id=${order.id}`);

  // What did the workflow produce?
  const inst = await prisma.workflowInstance.findFirst({
    where: { productionOrderItem: { orderId: order.id } },
    include: {
      tasks: {
        orderBy: { workflowStep: { stepOrder: 'asc' } },
        include: {
          workflowStep: { select: { stepOrder: true, stepCode: true, stepType: true } },
          department: { select: { code: true } },
          assignments: { where: { status: 'ACTIVE' }, include: { operator: { select: { email: true } } } },
        },
      },
    },
  });
  if (!inst) { console.log('!! NO WORKFLOW INSTANCE CREATED'); return; }
  log(`workflow instance ${inst.id} status=${inst.status}`);
  console.log('\n   STEP  CODE                  DEPT                 TASK-STATUS   ASSIGNED-TO');
  for (const t of inst.tasks) {
    const a = t.assignments[0];
    console.log(`   ${String(t.workflowStep.stepOrder).padStart(4)}  ${t.workflowStep.stepCode.padEnd(20)}  ${(t.department?.code ?? '-').padEnd(20)} ${t.status.padEnd(13)} ${a?.operator.email ?? '(unassigned)'}`);
  }
  console.log(`\nORDER_ID=${order.id}`);
}
main().catch((e) => console.error('ERR', e?.message ?? e)).finally(() => prisma.$disconnect());

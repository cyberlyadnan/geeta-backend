import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const [users, orders, walletTx, wallets, fe, ca, rc, versions, snaps, amend, cells, dt, db_, inv, roles] =
    await Promise.all([
      p.user.count(), p.productionOrder.count(), p.walletTransaction.count(), p.wallet.count(),
      p.financialEvent.count(), p.creditAccount.count(), p.retailCustomer.count(),
      p.productOfferingVersion.count(), p.priceSnapshot.count(), p.orderAmendment.count(),
      p.priceMatrixCell.count(), p.designTask.count(), p.dispatchBatch.count(), p.invoice.count(),
      p.role.findMany({ select: { id: true, name: true } }),
    ]);
  console.log(JSON.stringify({ users, orders, walletTx, wallets, financialEvents: fe, creditAccounts: ca,
    retailCustomers: rc, versions, snapshots: snaps, amendments: amend, matrixCells: cells,
    designTasks: dt, dispatchBatches: db_, invoices: inv }));
  console.log('roles:', roles.map(r => r.name).join(','));
}
main().catch(e => console.log('ERR', e.message.split('\n')[0])).finally(() => p.$disconnect());

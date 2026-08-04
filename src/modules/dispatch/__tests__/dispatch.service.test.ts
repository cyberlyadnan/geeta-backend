import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { DispatchService, type DispatchDb } from '../dispatch.service.js';
import { walletLedgerService } from '../../../services/ledger/wallet-ledger.service.js';
import { storageService } from '../../../services/storage/storage.service.js';

function dec(n: number) {
  return new Prisma.Decimal(n);
}

interface FakeState {
  status: string;
  deliveryCharge: Prisma.Decimal | null;
  heldShortfall: Prisma.Decimal | null;
  walletBalance: number;
  invoice: Record<string, unknown> | null;
}

/** Hand-rolled fake — node:test's mock.method cannot patch Prisma's proxy-based model
 *  delegates (see retail-customer.service tests), so the service takes an injectable db. */
function createFakeDb(options: {
  walletBalance?: number;
  retail?: boolean;
  orders?: Array<{ orderNumber: string; subtotal: number; quantity: number }>;
  status?: string;
}) {
  const orders = options.orders ?? [
    { orderNumber: 'GP-2026-000041', subtotal: 1200, quantity: 100 },
    { orderNumber: 'GP-2026-000042', subtotal: 800, quantity: 50 },
  ];

  const state: FakeState = {
    status: options.status ?? 'AWAITING_READY',
    deliveryCharge: null,
    heldShortfall: null,
    walletBalance: options.walletBalance ?? 100_000,
    invoice: null,
  };

  const calls = {
    debits: [] as Array<Record<string, unknown>>,
    notifications: [] as Array<Record<string, unknown>>,
    invoiceCreates: [] as Array<Record<string, unknown>>,
    sequenceUpserts: 0,
  };

  const buildBatch = () => ({
    id: 'batch-1',
    status: state.status,
    dispatchDate: '2026-08-04',
    deliveryCharge: state.deliveryCharge,
    heldShortfall: state.heldShortfall,
    heldAt: null,
    billedAt: null,
    dispatchedAt: null,
    createdAt: new Date('2026-08-04T09:00:00Z'),
    shift: { id: 'shift-14', label: '2:00 PM', cutoffTime: '14:00' },
    vendor: options.retail
      ? null
      : {
          id: 'vendor-1',
          firstName: 'Ravi',
          lastName: 'K',
          vendorProfile: { businessName: 'Ravi Prints', gstNumber: '27AAAAA0000A1Z5' },
        },
    retailCustomer: options.retail
      ? { id: 'retail-1', name: 'Walk-in Anita', hasGst: false, gstNumber: null }
      : null,
    invoice: state.invoice,
    orders: orders.map((o, i) => ({
      order: {
        id: `order-${i + 1}`,
        orderNumber: o.orderNumber,
        orderName: 'Business cards',
        subtotal: dec(o.subtotal),
        totalAmount: dec(o.subtotal * 1.18),
        items: [{ quantity: o.quantity }],
      },
    })),
  });

  const tx = {
    dispatchBatch: {
      findUnique: async () => buildBatch(),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (typeof data.status === 'string') state.status = data.status;
        if ('deliveryCharge' in data) state.deliveryCharge = data.deliveryCharge as Prisma.Decimal | null;
        if ('heldShortfall' in data) state.heldShortfall = data.heldShortfall as Prisma.Decimal | null;
        return buildBatch();
      },
    },
    invoiceNumberSequence: {
      upsert: async () => {
        calls.sequenceUpserts += 1;
        return { year: 2026, lastValue: calls.sequenceUpserts };
      },
    },
    invoice: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.invoiceCreates.push(data);
        state.invoice = { id: 'invoice-1', ...data };
        return state.invoice;
      },
    },
    wallet: {
      findUnique: async () => ({
        id: 'wallet-1',
        userId: 'vendor-1',
        currentBalance: dec(state.walletBalance),
      }),
      create: async () => ({ id: 'wallet-1', userId: 'vendor-1', currentBalance: dec(state.walletBalance) }),
    },
    userNotification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.notifications.push(data);
        return { id: 'notif-1', ...data };
      },
    },
  };

  const db: DispatchDb = {
    dispatchBatch: {
      findUnique: (async () => buildBatch()) as DispatchDb['dispatchBatch']['findUnique'],
      findMany: (async () => []) as DispatchDb['dispatchBatch']['findMany'],
      count: (async () => 0) as DispatchDb['dispatchBatch']['count'],
      update: (async () => buildBatch()) as DispatchDb['dispatchBatch']['update'],
    } as DispatchDb['dispatchBatch'],
    invoice: {
      findUnique: (async () => null) as DispatchDb['invoice']['findUnique'],
      update: (async () => state.invoice) as DispatchDb['invoice']['update'],
    } as DispatchDb['invoice'],
    $transaction: (async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) as DispatchDb['$transaction'],
  } as DispatchDb;

  return { db, state, calls };
}

/** Stubs the wallet ledger + storage so tests exercise dispatch logic, not their internals. */
function stubCollaborators(t: import('node:test').TestContext, calls: { debits: Array<Record<string, unknown>> }) {
  t.mock.method(walletLedgerService, 'debitWallet', async (input: Record<string, unknown>) => {
    calls.debits.push(input);
    return {} as never;
  });
  t.mock.method(storageService, 'uploadPdfFromBuffer', async () => ({
    key: 'invoices/x.pdf',
    publicUrl: 'https://cdn.example/invoices/x.pdf',
  }));
}

describe('setDeliveryCharge — charges delivery only, never the order value again', () => {
  it('debits delivery + GST on delivery, not the order subtotals', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 5000 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    const result = await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');

    assert.equal(result.status, 'READY');
    assert.equal(calls.debits.length, 1, 'exactly one wallet debit');
    // 150 delivery + 18% GST on it = 177. The 2,000 of order value was paid at placement.
    assert.equal(calls.debits[0]!.amount, 177);
    assert.equal(result.status === 'READY' ? result.amountCharged : null, 177);
  });

  it('writes exactly one DELIVERY_CHARGE_DEBIT financial event against the batch', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 5000 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');

    const event = calls.debits[0]!.financialEvent as Record<string, unknown>;
    assert.equal(calls.debits.length, 1);
    assert.equal(event.eventType, 'DELIVERY_CHARGE_DEBIT');
    assert.equal(event.referenceType, 'DISPATCH_BATCH');
    assert.equal(event.referenceId, 'batch-1');
    assert.equal(event.createdByUserId, 'dispatcher-1');
  });

  it('rejects a negative charge and refuses to re-bill an already billed batch', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 5000, status: 'READY' });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    await assert.rejects(() => service.setDeliveryCharge('batch-1', -5, 'd-1'), /cannot be negative/);
    await assert.rejects(() => service.setDeliveryCharge('batch-1', 150, 'd-1'), /already been billed/);
    assert.equal(calls.debits.length, 0);
  });

  it('refuses to bill an empty batch', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 5000, orders: [] });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    await assert.rejects(() => service.setDeliveryCharge('batch-1', 150, 'd-1'), /empty batch/);
  });
});

describe('setDeliveryCharge — insufficient balance holds the batch', () => {
  it('holds with the exact shortfall and notifies the vendor, without debiting', async (t) => {
    const { db, calls, state } = createFakeDb({ walletBalance: 100 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    const result = await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');

    assert.equal(result.status, 'HELD_INSUFFICIENT_BALANCE');
    // Needs 177, has 100 → short by 77.
    assert.equal(result.status === 'HELD_INSUFFICIENT_BALANCE' ? result.shortfall : null, 77);
    assert.equal(calls.debits.length, 0, 'nothing is debited when the batch is held');
    assert.equal(state.status, 'HELD_INSUFFICIENT_BALANCE');

    assert.equal(calls.notifications.length, 1);
    const notification = calls.notifications[0]!;
    assert.equal(notification.userId, 'vendor-1');
    assert.equal(notification.type, 'DISPATCH_BATCH_HELD');
    assert.match(String(notification.body), /77\.00/, 'the vendor is told the exact shortfall');
  });

  it('retains the dispatcher-entered charge on the held batch so it need not be re-entered', async (t) => {
    const { db, calls, state } = createFakeDb({ walletBalance: 100 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');

    assert.equal(state.deliveryCharge?.toNumber(), 150);
    assert.equal(state.heldShortfall?.toNumber(), 77);
  });

  it('generates no invoice while held', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 100 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');

    assert.equal(calls.invoiceCreates.length, 0);
    assert.equal(calls.sequenceUpserts, 0, 'no invoice number is burned on a held batch');
  });
});

describe('releaseHeldBatchesForVendor — top-up releases without re-entry', () => {
  it('bills the held batch using its stored charge once the wallet can cover it', async (t) => {
    const { db, calls, state } = createFakeDb({ walletBalance: 100 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');
    assert.equal(state.status, 'HELD_INSUFFICIENT_BALANCE');

    // Vendor tops up; the release path re-reads the balance.
    state.walletBalance = 5000;
    (db.dispatchBatch.findMany as unknown) = async () => [{ id: 'batch-1', deliveryCharge: dec(150) }];

    const released = await service.releaseHeldBatchesForVendor('vendor-1', 'system');

    assert.deepEqual(released.releasedBatchIds, ['batch-1']);
    assert.equal(state.status, 'READY');
    assert.equal(calls.debits.length, 1, 'the delivery charge is debited exactly once overall');
    assert.equal(calls.debits[0]!.amount, 177);
  });

  it('leaves the batch held when the top-up is still not enough', async (t) => {
    const { db, calls, state } = createFakeDb({ walletBalance: 100 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');
    state.walletBalance = 120; // still under 177
    (db.dispatchBatch.findMany as unknown) = async () => [{ id: 'batch-1', deliveryCharge: dec(150) }];

    const released = await service.releaseHeldBatchesForVendor('vendor-1', 'system');

    assert.deepEqual(released.releasedBatchIds, []);
    assert.equal(state.status, 'HELD_INSUFFICIENT_BALANCE');
    assert.equal(calls.debits.length, 0);
  });

  it('skips held batches that somehow have no stored charge', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 5000 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);
    (db.dispatchBatch.findMany as unknown) = async () => [{ id: 'batch-1', deliveryCharge: null }];

    const released = await service.releaseHeldBatchesForVendor('vendor-1', 'system');

    assert.deepEqual(released.releasedBatchIds, []);
    assert.equal(calls.debits.length, 0);
  });
});

describe('invoice generation — contents, GST math, sequential numbering', () => {
  it('records every order, delivery as its own line, and correct GST on the combined base', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 5000 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');

    assert.equal(calls.invoiceCreates.length, 1);
    const invoice = calls.invoiceCreates[0]!;

    // subtotal 1200 + 800 = 2000; + delivery 150 = 2150; GST 18% = 387; total 2537.
    assert.equal((invoice.subtotal as Prisma.Decimal).toNumber(), 2000);
    assert.equal((invoice.deliveryCharge as Prisma.Decimal).toNumber(), 150);
    assert.equal((invoice.gstAmount as Prisma.Decimal).toNumber(), 387);
    assert.equal((invoice.total as Prisma.Decimal).toNumber(), 2537);
    assert.equal((invoice.gstRate as Prisma.Decimal).toNumber(), 0.18);
  });

  it('reconciles: invoice total equals the placement debit plus the dispatch debit', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 5000 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    const result = await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');
    const invoice = calls.invoiceCreates[0]!;

    const ordersSubtotal = 2000;
    const paidAtPlacement = ordersSubtotal * 1.18; // 2360, charged when each order was placed
    const paidAtDispatch = result.status === 'READY' ? result.amountCharged : 0; // 177

    assert.equal(
      Math.round((paidAtPlacement + paidAtDispatch) * 100) / 100,
      (invoice.total as Prisma.Decimal).toNumber(),
      'the invoice bills exactly what was charged across both moments — no double charge, no gap',
    );
  });

  it('snapshots the billed party and their GST number onto the invoice', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 5000 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');
    const invoice = calls.invoiceCreates[0]!;

    assert.equal(invoice.actorType, 'VENDOR');
    assert.equal(invoice.actorId, 'vendor-1');
    assert.equal(invoice.billedToName, 'Ravi Prints');
    assert.equal(invoice.gstNumber, '27AAAAA0000A1Z5');
  });

  it('allocates the invoice number from the sequence inside the billing transaction', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 5000 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    const result = await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');

    assert.equal(calls.sequenceUpserts, 1, 'exactly one number allocated');
    assert.equal(calls.invoiceCreates[0]!.invoiceNumber, 'INV-2026-000001');
    assert.equal(result.status === 'READY' ? result.invoiceNumber : null, 'INV-2026-000001');
  });

  it('computes GST correctly when the delivery charge is zero', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 5000 });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    const result = await service.setDeliveryCharge('batch-1', 0, 'dispatcher-1');
    const invoice = calls.invoiceCreates[0]!;

    assert.equal(calls.debits.length, 0, 'a zero charge debits nothing');
    assert.equal((invoice.gstAmount as Prisma.Decimal).toNumber(), 360); // 18% of 2000
    assert.equal((invoice.total as Prisma.Decimal).toNumber(), 2360);
    assert.equal(result.status, 'READY');
  });

  it('rounds GST to two decimals rather than carrying float error', async (t) => {
    const { db, calls } = createFakeDb({
      walletBalance: 5000,
      orders: [{ orderNumber: 'GP-1', subtotal: 333.33, quantity: 1 }],
    });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    await service.setDeliveryCharge('batch-1', 66.67, 'dispatcher-1');
    const invoice = calls.invoiceCreates[0]!;

    // base 400.00 → GST 72.00 → total 472.00
    assert.equal((invoice.gstAmount as Prisma.Decimal).toNumber(), 72);
    assert.equal((invoice.total as Prisma.Decimal).toNumber(), 472);
  });
});

describe('retail customers — invoiced but never auto-debited', () => {
  it('bills a retail batch without touching any wallet', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 0, retail: true });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    const result = await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');

    assert.equal(result.status, 'READY', 'a retail batch is never held for balance');
    assert.equal(calls.debits.length, 0, 'retail customers have no wallet to debit');
    assert.equal(calls.invoiceCreates.length, 1, 'they still get an invoice');
    assert.equal(calls.invoiceCreates[0]!.actorType, 'RETAIL_CUSTOMER');
  });

  it('leaves the GST number null for an unregistered retail customer', async (t) => {
    const { db, calls } = createFakeDb({ walletBalance: 0, retail: true });
    stubCollaborators(t, calls);
    const service = new DispatchService(db);

    await service.setDeliveryCharge('batch-1', 150, 'dispatcher-1');

    assert.equal(calls.invoiceCreates[0]!.gstNumber, null);
    assert.equal(calls.invoiceCreates[0]!.billedToName, 'Walk-in Anita');
  });
});

mock.reset();

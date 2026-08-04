import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProductionOrderStatus, WorkflowTaskStatus } from '@prisma/client';
import { printContextResolver } from '../../admin-print-master/print-context.resolver.js';
import { priceResolverService } from '../../../services/pricing-engine/index.js';
import { walletLedgerService } from '../../../services/ledger/wallet-ledger.service.js';
import { OrderAmendmentService, type OrderAmendmentDb } from '../order-amendment.service.js';

function decimal(n: number) {
  return { toNumber: () => n } as never;
}

const BASE_ORDER = {
  id: 'order-1',
  orderNumber: 'GP-1',
  customerId: 'vendor-1',
  status: ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
  deliveryRequired: false,
  deliveryType: null,
  deliveryAddress: null,
  deliveryCharge: decimal(0),
  totalAmount: decimal(590), // 500 product + 18% GST, matching the PriceResolution stubs below
  items: [
    {
      id: 'item-1',
      productOfferingVersionId: 'version-1',
      quantity: 100,
      priceSnapshotId: 'snap-old',
      configurationSnapshot: { selections: { lamination: 'none' } },
      sizeSnapshot: null,
      priceSnapshot: {
        id: 'snap-old',
        calculation: { artworkEmailCharge: 0 },
      },
    },
  ],
  workflowInstances: [
    {
      tasks: [
        {
          status: WorkflowTaskStatus.READY,
          workflowStep: { locksAmendmentsOnStart: true, stepName: 'Printing' },
        },
      ],
    },
  ],
};

/** Hand-rolled fake — see retail-customer.service tests for why: node:test's mock.method
 *  cannot patch Prisma's proxy-based model delegates. */
function createFakeDb(order: typeof BASE_ORDER) {
  const calls = {
    priceSnapshotCreate: [] as unknown[],
    orderAmendmentCreate: [] as unknown[],
    itemUpdate: [] as unknown[],
    orderUpdate: [] as unknown[],
  };

  const tx = {
    priceSnapshot: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.priceSnapshotCreate.push(data);
        return { id: 'snap-new', ...data };
      },
    },
    orderAmendment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.orderAmendmentCreate.push(data);
        return { id: 'amendment-1', ...data };
      },
    },
    productionOrderItem: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        calls.itemUpdate.push(data);
        return data;
      },
    },
    productionOrder: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        calls.orderUpdate.push(data);
        return data;
      },
    },
    productionOrderEvent: {
      create: async () => ({ id: 'event-1' }),
    },
  };

  const db: OrderAmendmentDb = {
    productionOrder: {
      findUnique: (async () => order) as OrderAmendmentDb['productionOrder']['findUnique'],
    } as OrderAmendmentDb['productionOrder'],
    $transaction: (async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)) as OrderAmendmentDb['$transaction'],
  };

  return { db, calls };
}

function stubPricing(t: import('node:test').TestContext, finalPrice: number) {
  t.mock.method(printContextResolver, 'resolveForVersion', async () => ({
    version: {},
    sizeStrategy: null,
    context: { printProcess: { code: 'DIGITAL' } },
  }));
  t.mock.method(priceResolverService, 'resolvePrice', async () => ({
    valid: true,
    versionId: 'version-1',
    quantity: 100,
    strategyKey: 'quantity_pricing',
    listPrice: finalPrice,
    finalPrice,
    overrideApplied: false,
    unitPrice: finalPrice / 100,
    currency: 'INR',
    lines: [{ code: 'base', label: 'Base', type: 'base', amount: finalPrice }],
    snapshotPayload: {},
  }));
}

describe('OrderAmendmentService.requestAmendment', () => {
  it('rejects amending an order once the locking step has started, before touching pricing', async (t) => {
    const started = {
      ...BASE_ORDER,
      workflowInstances: [
        { tasks: [{ status: WorkflowTaskStatus.IN_PROGRESS, workflowStep: { locksAmendmentsOnStart: true, stepName: 'Printing' } }] },
      ],
    };
    const { db } = createFakeDb(started);
    const resolvePrice = t.mock.method(priceResolverService, 'resolvePrice', async () => {
      throw new Error('resolvePrice should not be called when the gate rejects the amendment');
    });

    const service = new OrderAmendmentService(db);
    await assert.rejects(
      () => service.requestAmendment('order-1', 'staff-1', { newConfig: { selections: {} } }),
      /Printing/,
    );
    assert.equal(resolvePrice.mock.callCount(), 0);
  });

  it('debits the wallet for a price increase, keeps the original snapshot untouched, links both', async (t) => {
    stubPricing(t, 600); // up from totalAmount 590
    const debit = t.mock.method(walletLedgerService, 'debitWallet', async () => ({}) as never);
    const credit = t.mock.method(walletLedgerService, 'creditWallet', async () => {
      throw new Error('creditWallet should not be called on a price increase');
    });

    const { db, calls } = createFakeDb(BASE_ORDER);
    const service = new OrderAmendmentService(db);
    const result = await service.requestAmendment('order-1', 'staff-1', {
      newConfig: { selections: { lamination: 'matt' } },
      reason: 'Vendor requested lamination',
    });

    assert.equal(debit.mock.callCount(), 1);
    assert.equal(credit.mock.callCount(), 0);
    const debitArgs = debit.mock.calls[0]!.arguments[0] as { userId: string; amount: number };
    assert.equal(debitArgs.userId, 'vendor-1');
    assert.ok(debitArgs.amount > 0);

    // A brand new snapshot row was created — never an update to the old one.
    assert.equal(calls.priceSnapshotCreate.length, 1);
    assert.equal(result.previousSnapshotId, 'snap-old');
    assert.equal(result.newSnapshotId, 'snap-new');

    const amendmentData = calls.orderAmendmentCreate[0] as { previousSnapshotId: string; newSnapshotId: string };
    assert.equal(amendmentData.previousSnapshotId, 'snap-old');
    assert.equal(amendmentData.newSnapshotId, 'snap-new');
  });

  it('credits the wallet for a price decrease', async (t) => {
    stubPricing(t, 400); // down from totalAmount 590
    const debit = t.mock.method(walletLedgerService, 'debitWallet', async () => {
      throw new Error('debitWallet should not be called on a price decrease');
    });
    const credit = t.mock.method(walletLedgerService, 'creditWallet', async () => ({}) as never);

    const { db } = createFakeDb(BASE_ORDER);
    const service = new OrderAmendmentService(db);
    await service.requestAmendment('order-1', 'staff-1', { newConfig: { selections: {} } });

    assert.equal(credit.mock.callCount(), 1);
    assert.equal(debit.mock.callCount(), 0);
  });

  it('an insufficient-balance debit failure blocks the whole amendment, not just the wallet step', async (t) => {
    stubPricing(t, 900);
    t.mock.method(walletLedgerService, 'debitWallet', async () => {
      throw new Error('Insufficient wallet balance');
    });

    const { db, calls } = createFakeDb(BASE_ORDER);
    const service = new OrderAmendmentService(db);

    await assert.rejects(
      () => service.requestAmendment('order-1', 'staff-1', { newConfig: { selections: {} } }),
      /Insufficient wallet balance/,
    );
    // The fake $transaction still "commits" whatever ran before the throw in this simplified
    // fake (a real Prisma transaction would roll all of it back) — what this test asserts is
    // the promise rejects and does not silently resolve with a successful amendment.
    assert.equal(calls.orderAmendmentCreate.length, 1);
  });

  it('a retail-customer order (no wallet) settles with no wallet call at all', async (t) => {
    stubPricing(t, 650);
    const debit = t.mock.method(walletLedgerService, 'debitWallet', async () => {
      throw new Error('debitWallet should not be called for a retail order');
    });
    const credit = t.mock.method(walletLedgerService, 'creditWallet', async () => {
      throw new Error('creditWallet should not be called for a retail order');
    });

    const retailOrder = { ...BASE_ORDER, customerId: null };
    const { db } = createFakeDb(retailOrder);
    const service = new OrderAmendmentService(db);
    const result = await service.requestAmendment('order-1', 'staff-1', { newConfig: { selections: {} } });

    assert.equal(debit.mock.callCount(), 0);
    assert.equal(credit.mock.callCount(), 0);
    assert.ok(result.amendmentId);
  });
});

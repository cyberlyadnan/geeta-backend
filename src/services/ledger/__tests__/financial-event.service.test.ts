import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { FinancialEventService, type FinancialEventDb } from '../financial-event.service.js';

type EventRow = {
  id: string;
  actorType: 'VENDOR' | 'RETAIL_CUSTOMER';
  actorId: string;
  eventType: string;
  amount: Prisma.Decimal;
  direction: 'DEBIT' | 'CREDIT';
  instrument: 'WALLET' | 'UDHAR';
  referenceType: string;
  referenceId: string;
  createdByUserId: string | null;
  createdAt: Date;
};

function event(overrides: Partial<EventRow> & Pick<EventRow, 'id' | 'createdAt'>): EventRow {
  return {
    actorType: 'VENDOR',
    actorId: 'vendor-1',
    eventType: 'ORDER_PLACEMENT_DEBIT',
    amount: new Prisma.Decimal(100),
    direction: 'DEBIT',
    instrument: 'WALLET',
    referenceType: 'ORDER',
    referenceId: 'order-1',
    createdByUserId: null,
    ...overrides,
  } as EventRow;
}

/** Hand-rolled fake — node:test's mock.method cannot patch Prisma's proxy-based model
 *  delegates (see retail-customer.service tests), so the service takes an injectable db. */
function createFakeDb(rows: EventRow[]) {
  const seen = { where: null as unknown, orderBy: null as unknown };

  const db: FinancialEventDb = {
    financialEvent: {
      findMany: (async (args: { where: unknown; orderBy: unknown; skip: number; take: number }) => {
        seen.where = args.where;
        seen.orderBy = args.orderBy;
        const matched = rows.filter((r) => matches(r, args.where as Record<string, unknown>));
        const sorted = [...matched].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return sorted.slice(args.skip, args.skip + args.take);
      }) as FinancialEventDb['financialEvent']['findMany'],
      count: (async (args: { where: unknown }) =>
        rows.filter((r) => matches(r, args.where as Record<string, unknown>))
          .length) as FinancialEventDb['financialEvent']['count'],
    } as FinancialEventDb['financialEvent'],
    user: {
      findMany: (async () => [
        { id: 'vendor-1', firstName: 'Ravi', lastName: 'K', vendorProfile: { businessName: 'Ravi Prints' } },
      ]) as FinancialEventDb['user']['findMany'],
    } as FinancialEventDb['user'],
    retailCustomer: {
      findMany: (async () => [{ id: 'retail-1', name: 'Walk-in Anita' }]) as FinancialEventDb['retailCustomer']['findMany'],
    } as FinancialEventDb['retailCustomer'],
  };

  return { db, seen };
}

function matches(row: EventRow, where: Record<string, unknown>) {
  if (where.actorId && row.actorId !== where.actorId) return false;
  if (where.actorType && row.actorType !== where.actorType) return false;
  if (where.eventType && row.eventType !== where.eventType) return false;
  const createdAt = where.createdAt as { gte?: Date; lte?: Date } | undefined;
  if (createdAt?.gte && row.createdAt < createdAt.gte) return false;
  if (createdAt?.lte && row.createdAt > createdAt.lte) return false;
  return true;
}

const VENDOR_HISTORY = [
  event({
    id: 'e1',
    createdAt: new Date('2026-08-01T09:00:00Z'),
    eventType: 'WALLET_TOPUP',
    direction: 'CREDIT',
    instrument: 'WALLET',
    referenceType: 'TOPUP',
    referenceId: 'pay-1',
    amount: new Prisma.Decimal(5000),
  }),
  event({
    id: 'e2',
    createdAt: new Date('2026-08-02T09:00:00Z'),
    eventType: 'ORDER_PLACEMENT_DEBIT',
    amount: new Prisma.Decimal(1200),
  }),
  event({
    id: 'e3',
    createdAt: new Date('2026-08-03T09:00:00Z'),
    eventType: 'UDHAR_DRAW',
    direction: 'DEBIT',
    instrument: 'UDHAR',
    referenceType: 'DRAW',
    referenceId: 'credit-tx-1',
    amount: new Prisma.Decimal(800),
  }),
  event({
    id: 'e4',
    createdAt: new Date('2026-08-04T09:00:00Z'),
    eventType: 'UDHAR_REPAYMENT',
    direction: 'CREDIT',
    instrument: 'UDHAR',
    referenceType: 'REPAYMENT',
    referenceId: 'credit-tx-2',
    amount: new Prisma.Decimal(300),
  }),
  event({
    id: 'e5',
    createdAt: new Date('2026-08-05T09:00:00Z'),
    actorType: 'RETAIL_CUSTOMER',
    actorId: 'retail-1',
    eventType: 'UDHAR_DRAW',
    direction: 'DEBIT',
    instrument: 'UDHAR',
    referenceType: 'DRAW',
    referenceId: 'credit-tx-3',
    amount: new Prisma.Decimal(450),
  }),
];

describe('FinancialEventService.list — combined wallet + Udhar history', () => {
  it('returns one actor\'s wallet and Udhar activity together, newest first', async () => {
    const { db, seen } = createFakeDb(VENDOR_HISTORY);
    const service = new FinancialEventService(db);

    const result = await service.list({ actorId: 'vendor-1', page: 1, limit: 50 });

    assert.deepEqual(
      result.data.map((e) => e.id),
      ['e4', 'e3', 'e2', 'e1'],
      'sorted by time, newest first, and excludes the other actor',
    );
    assert.deepEqual(
      result.data.map((e) => e.instrument),
      ['UDHAR', 'UDHAR', 'WALLET', 'WALLET'],
      'wallet and Udhar movements appear in the same stream',
    );
    assert.deepEqual(seen.orderBy, { createdAt: 'desc' });
    assert.equal(result.meta.total, 4);
  });

  it('enriches each row with the actor display name', async () => {
    const { db } = createFakeDb(VENDOR_HISTORY);
    const service = new FinancialEventService(db);

    const vendorResult = await service.list({ actorId: 'vendor-1', page: 1, limit: 50 });
    assert.equal(vendorResult.data[0]!.actorName, 'Ravi Prints');

    const retailResult = await service.list({ actorId: 'retail-1', page: 1, limit: 50 });
    assert.equal(retailResult.data[0]!.actorName, 'Walk-in Anita');
  });

  it('filters by actorType, eventType and a date range', async () => {
    const { db } = createFakeDb(VENDOR_HISTORY);
    const service = new FinancialEventService(db);

    const retailOnly = await service.list({ actorType: 'RETAIL_CUSTOMER', page: 1, limit: 50 });
    assert.deepEqual(retailOnly.data.map((e) => e.id), ['e5']);

    const drawsOnly = await service.list({ eventType: 'UDHAR_DRAW', page: 1, limit: 50 });
    assert.deepEqual(drawsOnly.data.map((e) => e.id), ['e5', 'e3']);

    const windowed = await service.list({
      actorId: 'vendor-1',
      from: new Date('2026-08-02T00:00:00Z'),
      to: new Date('2026-08-03T23:59:59Z'),
      page: 1,
      limit: 50,
    });
    assert.deepEqual(windowed.data.map((e) => e.id), ['e3', 'e2']);
  });

  it('paginates and reports the unpaginated total', async () => {
    const { db } = createFakeDb(VENDOR_HISTORY);
    const service = new FinancialEventService(db);

    const page1 = await service.list({ actorId: 'vendor-1', page: 1, limit: 2 });
    assert.deepEqual(page1.data.map((e) => e.id), ['e4', 'e3']);
    assert.equal(page1.meta.total, 4);
    assert.equal(page1.meta.totalPages, 2);

    const page2 = await service.list({ actorId: 'vendor-1', page: 2, limit: 2 });
    assert.deepEqual(page2.data.map((e) => e.id), ['e2', 'e1']);
  });

  it('serialises amounts as numbers and timestamps as ISO strings', async () => {
    const { db } = createFakeDb(VENDOR_HISTORY);
    const service = new FinancialEventService(db);

    const result = await service.list({ actorId: 'vendor-1', page: 1, limit: 1 });
    const row = result.data[0]!;
    assert.equal(row.amount, 300);
    assert.equal(typeof row.amount, 'number');
    assert.equal(row.createdAt, '2026-08-04T09:00:00.000Z');
  });
});

describe('FinancialEventService.record — writes inside the caller\'s transaction', () => {
  it('creates the row via the passed transaction client, never its own', async () => {
    const created: Array<Record<string, unknown>> = [];
    const tx = {
      financialEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'fin-1', ...data };
        },
      },
    } as unknown as Prisma.TransactionClient;

    const service = new FinancialEventService(createFakeDb([]).db);
    await service.record(
      {
        actorType: 'VENDOR',
        actorId: 'vendor-1',
        eventType: 'DELIVERY_CHARGE_DEBIT',
        amount: 250,
        direction: 'DEBIT',
        instrument: 'WALLET',
        referenceType: 'DISPATCH_BATCH',
        referenceId: 'batch-1',
        createdByUserId: 'staff-1',
      },
      tx,
    );

    assert.equal(created.length, 1);
    assert.equal(created[0]!.eventType, 'DELIVERY_CHARGE_DEBIT');
    assert.equal(created[0]!.referenceType, 'DISPATCH_BATCH');
    assert.equal((created[0]!.amount as Prisma.Decimal).toNumber(), 250);
  });

  it('stores a null createdByUserId for system-triggered movements', async () => {
    const created: Array<Record<string, unknown>> = [];
    const tx = {
      financialEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'fin-1', ...data };
        },
      },
    } as unknown as Prisma.TransactionClient;

    const service = new FinancialEventService(createFakeDb([]).db);
    await service.record(
      {
        actorType: 'VENDOR',
        actorId: 'vendor-1',
        eventType: 'WALLET_TOPUP',
        amount: 1000,
        direction: 'CREDIT',
        instrument: 'WALLET',
        referenceType: 'TOPUP',
        referenceId: 'pay-1',
      },
      tx,
    );

    assert.equal(created[0]!.createdByUserId, null);
  });
});

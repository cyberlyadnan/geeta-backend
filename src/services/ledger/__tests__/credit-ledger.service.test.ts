import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma, type FinancialActorType } from '@prisma/client';
import { CreditLedgerService, type CreditLedgerDb } from '../credit-ledger.service.js';

interface FakeAccount {
  id: string;
  actorType: FinancialActorType;
  actorId: string;
  creditLimit: Prisma.Decimal;
  outstandingBalance: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}

/** Hand-rolled fake — node:test's mock.method cannot patch Prisma's proxy-based model
 *  delegates (see retail-customer.service tests), so the service takes an injectable db. */
function createFakeDb(account: FakeAccount | null) {
  const calls = {
    creditTransactionCreate: [] as Array<Record<string, unknown>>,
    financialEventCreate: [] as Array<Record<string, unknown>>,
    accountUpdate: [] as Array<Record<string, unknown>>,
    lockedIds: [] as string[],
  };

  let current = account;

  const tx = {
    creditAccount: {
      findUnique: async () => current,
      findUniqueOrThrow: async () => {
        if (!current) throw new Error('not found');
        return current;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        calls.accountUpdate.push(data);
        current = { ...current!, ...data, updatedAt: new Date() } as FakeAccount;
        return current;
      },
    },
    creditTransaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.creditTransactionCreate.push(data);
        return { id: `credit-tx-${calls.creditTransactionCreate.length}`, createdAt: new Date(), ...data };
      },
    },
    financialEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.financialEventCreate.push(data);
        return { id: `fin-event-${calls.financialEventCreate.length}`, createdAt: new Date(), ...data };
      },
    },
    $queryRaw: async (..._args: unknown[]) => {
      if (!current) return [];
      calls.lockedIds.push(current.id);
      return [{ id: current.id }];
    },
  };

  const db: CreditLedgerDb = {
    creditAccount: {
      findUnique: (async () => current) as CreditLedgerDb['creditAccount']['findUnique'],
      upsert: (async ({ create, update }: { create: FakeAccount; update: Record<string, unknown> }) => {
        current = current
          ? ({ ...current, ...update, updatedAt: new Date() } as FakeAccount)
          : ({
              id: 'account-new',
              outstandingBalance: new Prisma.Decimal(0),
              createdAt: new Date(),
              updatedAt: new Date(),
              ...create,
            } as FakeAccount);
        return current;
      }) as CreditLedgerDb['creditAccount']['upsert'],
    } as CreditLedgerDb['creditAccount'],
    creditTransaction: {
      findMany: (async () => []) as CreditLedgerDb['creditTransaction']['findMany'],
      count: (async () => 0) as CreditLedgerDb['creditTransaction']['count'],
    } as CreditLedgerDb['creditTransaction'],
    $transaction: (async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) as CreditLedgerDb['$transaction'],
  };

  return { db, calls, getAccount: () => current };
}

function account(overrides: Partial<FakeAccount> = {}): FakeAccount {
  return {
    id: 'account-1',
    actorType: 'VENDOR',
    actorId: 'vendor-1',
    creditLimit: new Prisma.Decimal(10_000),
    outstandingBalance: new Prisma.Decimal(0),
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

describe('CreditLedgerService.drawOnCredit — limit enforcement', () => {
  it('allows a draw within the limit and increases the outstanding balance', async () => {
    const { db, calls, getAccount } = createFakeDb(account());
    const service = new CreditLedgerService(db);

    const result = await service.drawOnCredit({
      actorType: 'VENDOR',
      actorId: 'vendor-1',
      amount: 4000,
      recordedByUserId: 'staff-1',
    });

    assert.equal(result.account.outstandingBalance, 4000);
    assert.equal(result.account.availableCredit, 6000);
    assert.equal(getAccount()!.outstandingBalance.toNumber(), 4000);
    assert.equal(calls.lockedIds.length, 1, 'the account row must be locked exactly once');
  });

  it('blocks a draw that exceeds available credit, naming the remaining amount', async () => {
    const { db, calls } = createFakeDb(account({ outstandingBalance: new Prisma.Decimal(8500) }));
    const service = new CreditLedgerService(db);

    await assert.rejects(
      () =>
        service.drawOnCredit({
          actorType: 'VENDOR',
          actorId: 'vendor-1',
          amount: 2000,
          recordedByUserId: 'staff-1',
        }),
      /exceeds available credit.*1,500/,
    );

    assert.equal(calls.creditTransactionCreate.length, 0, 'no CreditTransaction on a blocked draw');
    assert.equal(calls.financialEventCreate.length, 0, 'no FinancialEvent on a blocked draw');
    assert.equal(calls.accountUpdate.length, 0, 'balance must not move on a blocked draw');
  });

  it('allows a draw that exactly exhausts the limit', async () => {
    const { db } = createFakeDb(account({ outstandingBalance: new Prisma.Decimal(9000) }));
    const service = new CreditLedgerService(db);

    const result = await service.drawOnCredit({
      actorType: 'VENDOR',
      actorId: 'vendor-1',
      amount: 1000,
      recordedByUserId: 'staff-1',
    });

    assert.equal(result.account.outstandingBalance, 10_000);
    assert.equal(result.account.availableCredit, 0);
  });

  it('blocks any draw when no credit account has been set up', async () => {
    const { db, calls } = createFakeDb(null);
    const service = new CreditLedgerService(db);

    await assert.rejects(
      () =>
        service.drawOnCredit({
          actorType: 'VENDOR',
          actorId: 'vendor-unknown',
          amount: 100,
          recordedByUserId: 'staff-1',
        }),
      /No credit account has been set up/,
    );
    assert.equal(calls.creditTransactionCreate.length, 0);
    assert.equal(calls.financialEventCreate.length, 0);
  });

  it('rejects a non-positive draw amount', async () => {
    const { db } = createFakeDb(account());
    const service = new CreditLedgerService(db);
    await assert.rejects(
      () => service.drawOnCredit({ actorType: 'VENDOR', actorId: 'vendor-1', amount: 0, recordedByUserId: 'staff-1' }),
      /must be positive/,
    );
  });
});

describe('CreditLedgerService.recordRepayment — balance behaviour', () => {
  it('reduces the outstanding balance by the repayment amount', async () => {
    const { db, calls } = createFakeDb(account({ outstandingBalance: new Prisma.Decimal(5000) }));
    const service = new CreditLedgerService(db);

    const result = await service.recordRepayment({
      actorType: 'VENDOR',
      actorId: 'vendor-1',
      amount: 2000,
      recordedByUserId: 'staff-1',
    });

    assert.equal(result.account.outstandingBalance, 3000);
    assert.equal(calls.lockedIds.length, 1, 'the account row must be locked exactly once');
  });

  it('caps the balance at 0 on over-repayment but still records the full amount', async () => {
    const { db, calls } = createFakeDb(account({ outstandingBalance: new Prisma.Decimal(1000) }));
    const service = new CreditLedgerService(db);

    const result = await service.recordRepayment({
      actorType: 'VENDOR',
      actorId: 'vendor-1',
      amount: 2500,
      recordedByUserId: 'staff-1',
    });

    assert.equal(result.account.outstandingBalance, 0, 'balance must never go negative');
    assert.equal(
      (calls.creditTransactionCreate[0]!.amount as Prisma.Decimal).toNumber(),
      2500,
      'the full repayment amount is still recorded, not the capped delta',
    );
    assert.equal(
      (calls.financialEventCreate[0]!.amount as Prisma.Decimal).toNumber(),
      2500,
      'the FinancialEvent records the full repayment amount too',
    );
  });

  it('rejects a non-positive repayment amount', async () => {
    const { db } = createFakeDb(account({ outstandingBalance: new Prisma.Decimal(500) }));
    const service = new CreditLedgerService(db);
    await assert.rejects(
      () =>
        service.recordRepayment({ actorType: 'VENDOR', actorId: 'vendor-1', amount: -5, recordedByUserId: 'staff-1' }),
      /must be positive/,
    );
  });
});

describe('CreditLedgerService — exactly one CreditTransaction and one FinancialEvent per movement', () => {
  it('writes exactly one of each on a draw, with UDHAR/DEBIT classification', async () => {
    const { db, calls } = createFakeDb(account());
    const service = new CreditLedgerService(db);

    await service.drawOnCredit({
      actorType: 'VENDOR',
      actorId: 'vendor-1',
      amount: 1500,
      referenceType: 'ORDER',
      referenceId: 'order-9',
      recordedByUserId: 'staff-1',
    });

    assert.equal(calls.creditTransactionCreate.length, 1);
    assert.equal(calls.financialEventCreate.length, 1);

    const creditTx = calls.creditTransactionCreate[0]!;
    assert.equal(creditTx.type, 'DRAW');
    assert.equal(creditTx.referenceType, 'ORDER');
    assert.equal(creditTx.referenceId, 'order-9');
    assert.equal(creditTx.recordedByUserId, 'staff-1');

    const event = calls.financialEventCreate[0]!;
    assert.equal(event.eventType, 'UDHAR_DRAW');
    assert.equal(event.instrument, 'UDHAR');
    assert.equal(event.direction, 'DEBIT');
    assert.equal(event.actorType, 'VENDOR');
    assert.equal(event.actorId, 'vendor-1');
    assert.equal(event.referenceType, 'ORDER');
    assert.equal(event.referenceId, 'order-9');
    assert.equal(event.createdByUserId, 'staff-1');
  });

  it('writes exactly one of each on a repayment, with UDHAR/CREDIT classification', async () => {
    const { db, calls } = createFakeDb(account({ outstandingBalance: new Prisma.Decimal(3000) }));
    const service = new CreditLedgerService(db);

    await service.recordRepayment({
      actorType: 'VENDOR',
      actorId: 'vendor-1',
      amount: 1000,
      recordedByUserId: 'staff-2',
      note: 'cash',
    });

    assert.equal(calls.creditTransactionCreate.length, 1);
    assert.equal(calls.financialEventCreate.length, 1);

    const creditTx = calls.creditTransactionCreate[0]!;
    assert.equal(creditTx.type, 'REPAYMENT');
    assert.equal(creditTx.note, 'cash');

    const event = calls.financialEventCreate[0]!;
    assert.equal(event.eventType, 'UDHAR_REPAYMENT');
    assert.equal(event.instrument, 'UDHAR');
    assert.equal(event.direction, 'CREDIT');
    assert.equal(event.referenceType, 'REPAYMENT');
    assert.equal(event.referenceId, 'credit-tx-1', 'a repayment references its own CreditTransaction');
  });

  it('falls back to referencing the CreditTransaction when a draw has no business reference', async () => {
    const { db, calls } = createFakeDb(account());
    const service = new CreditLedgerService(db);

    await service.drawOnCredit({
      actorType: 'VENDOR',
      actorId: 'vendor-1',
      amount: 200,
      recordedByUserId: 'staff-1',
    });

    const event = calls.financialEventCreate[0]!;
    assert.equal(event.referenceType, 'DRAW');
    assert.equal(event.referenceId, 'credit-tx-1');
  });
});

describe('CreditLedgerService — retail customers behave identically to vendors', () => {
  it('enforces the limit for a RETAIL_CUSTOMER actor', async () => {
    const { db } = createFakeDb(
      account({
        id: 'account-retail',
        actorType: 'RETAIL_CUSTOMER',
        actorId: 'retail-1',
        creditLimit: new Prisma.Decimal(2000),
        outstandingBalance: new Prisma.Decimal(1800),
      }),
    );
    const service = new CreditLedgerService(db);

    await assert.rejects(
      () =>
        service.drawOnCredit({
          actorType: 'RETAIL_CUSTOMER',
          actorId: 'retail-1',
          amount: 500,
          recordedByUserId: 'staff-1',
        }),
      /exceeds available credit.*200/,
    );
  });

  it('draws, repays and tags the FinancialEvent with RETAIL_CUSTOMER', async () => {
    const { db, calls } = createFakeDb(
      account({
        id: 'account-retail',
        actorType: 'RETAIL_CUSTOMER',
        actorId: 'retail-1',
        creditLimit: new Prisma.Decimal(5000),
      }),
    );
    const service = new CreditLedgerService(db);

    const drawn = await service.drawOnCredit({
      actorType: 'RETAIL_CUSTOMER',
      actorId: 'retail-1',
      amount: 3000,
      recordedByUserId: 'staff-1',
    });
    assert.equal(drawn.account.outstandingBalance, 3000);
    assert.equal(calls.financialEventCreate[0]!.actorType, 'RETAIL_CUSTOMER');
    assert.equal(calls.financialEventCreate[0]!.actorId, 'retail-1');

    const repaid = await service.recordRepayment({
      actorType: 'RETAIL_CUSTOMER',
      actorId: 'retail-1',
      amount: 1200,
      recordedByUserId: 'staff-1',
    });
    assert.equal(repaid.account.outstandingBalance, 1800);
    assert.equal(calls.financialEventCreate[1]!.actorType, 'RETAIL_CUSTOMER');
    assert.equal(calls.financialEventCreate[1]!.eventType, 'UDHAR_REPAYMENT');
  });
});

describe('CreditLedgerService.setCreditLimit', () => {
  it('creates an account with a zero opening balance when none exists', async () => {
    const { db } = createFakeDb(null);
    const service = new CreditLedgerService(db);

    const result = await service.setCreditLimit({
      actorType: 'RETAIL_CUSTOMER',
      actorId: 'retail-2',
      creditLimit: 7500,
    });

    assert.equal(result.creditLimit, 7500);
    assert.equal(result.outstandingBalance, 0);
    assert.equal(result.availableCredit, 7500);
  });

  it('updates the limit on an existing account without touching the outstanding balance', async () => {
    const { db } = createFakeDb(account({ outstandingBalance: new Prisma.Decimal(2500) }));
    const service = new CreditLedgerService(db);

    const result = await service.setCreditLimit({
      actorType: 'VENDOR',
      actorId: 'vendor-1',
      creditLimit: 20_000,
    });

    assert.equal(result.creditLimit, 20_000);
    assert.equal(result.outstandingBalance, 2500);
    assert.equal(result.availableCredit, 17_500);
  });

  it('rejects a negative credit limit', async () => {
    const { db } = createFakeDb(account());
    const service = new CreditLedgerService(db);
    await assert.rejects(
      () => service.setCreditLimit({ actorType: 'VENDOR', actorId: 'vendor-1', creditLimit: -1 }),
      /cannot be negative/,
    );
  });
});

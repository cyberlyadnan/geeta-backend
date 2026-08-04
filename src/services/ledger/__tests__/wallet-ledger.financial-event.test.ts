import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FinancialAuditAction,
  Prisma,
  WalletTransactionType,
} from '@prisma/client';
import { WalletLedgerService } from '../wallet-ledger.service.js';

/**
 * These tests drive creditWallet/debitWallet with a fake transaction client — the same
 * `existingTx` seam the real callers (orders, amendments, payments) use. Everything the
 * service writes lands on that one client, which is what proves the FinancialEvent write
 * and the balance update share a transaction: a fake that recorded them separately could
 * not observe them arriving through the same object.
 */
function createFakeTx(startingBalance: number) {
  const writes = {
    walletUpdate: [] as Array<Record<string, unknown>>,
    walletTransaction: [] as Array<Record<string, unknown>>,
    snapshot: [] as Array<Record<string, unknown>>,
    auditLog: [] as Array<Record<string, unknown>>,
    financialEvent: [] as Array<Record<string, unknown>>,
    order: [] as string[],
  };

  const wallet = {
    id: 'wallet-1',
    userId: 'vendor-1',
    currentBalance: new Prisma.Decimal(startingBalance),
    totalAdded: new Prisma.Decimal(0),
    totalSpent: new Prisma.Decimal(0),
    totalRefunds: new Prisma.Decimal(0),
    currency: 'INR',
    lastRechargeAt: null,
  };

  const tx = {
    wallet: {
      findUnique: async () => wallet,
      findUniqueOrThrow: async () => wallet,
      create: async () => wallet,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.walletUpdate.push(data);
        writes.order.push('wallet.update');
        return { ...wallet, ...data };
      },
    },
    walletTransaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.walletTransaction.push(data);
        writes.order.push('walletTransaction.create');
        return { id: 'wallet-tx-1', ...data };
      },
    },
    walletBalanceSnapshot: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.snapshot.push(data);
        writes.order.push('walletBalanceSnapshot.create');
        return { id: 'snap-1', ...data };
      },
    },
    financialAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.auditLog.push(data);
        writes.order.push('financialAuditLog.create');
        return { id: 'audit-1', ...data };
      },
    },
    financialEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.financialEvent.push(data);
        writes.order.push('financialEvent.create');
        return { id: 'fin-1', ...data };
      },
    },
    $queryRaw: async () => [{ id: 'wallet-1' }],
  } as unknown as Prisma.TransactionClient;

  return { tx, writes };
}

const service = new WalletLedgerService();

describe('walletLedgerService.debitWallet — FinancialEvent coverage', () => {
  it('writes exactly one FinancialEvent alongside the balance update, on the same transaction client', async () => {
    const { tx, writes } = createFakeTx(5000);

    await service.debitWallet(
      {
        userId: 'vendor-1',
        amount: 1200,
        type: WalletTransactionType.ORDER_PAYMENT,
        productionOrderId: 'order-1',
        auditAction: FinancialAuditAction.WALLET_DEBIT,
        auditActorId: 'staff-1',
        financialEvent: {
          eventType: 'ORDER_PLACEMENT_DEBIT',
          referenceType: 'ORDER',
          referenceId: 'order-1',
          createdByUserId: 'staff-1',
        },
      },
      tx,
    );

    assert.equal(writes.walletUpdate.length, 1);
    assert.equal(writes.financialEvent.length, 1, 'exactly one FinancialEvent per wallet debit');

    const event = writes.financialEvent[0]!;
    assert.equal(event.actorType, 'VENDOR', 'wallets only exist for vendor users');
    assert.equal(event.actorId, 'vendor-1');
    assert.equal(event.eventType, 'ORDER_PLACEMENT_DEBIT');
    assert.equal(event.direction, 'DEBIT');
    assert.equal(event.instrument, 'WALLET');
    assert.equal(event.referenceType, 'ORDER');
    assert.equal(event.referenceId, 'order-1');
    assert.equal(event.createdByUserId, 'staff-1');
    assert.equal((event.amount as Prisma.Decimal).toNumber(), 1200);

    assert.ok(
      writes.order.includes('wallet.update') && writes.order.includes('financialEvent.create'),
      'the balance update and the ledger write both go through the caller-supplied tx',
    );
  });

  it('writes no FinancialEvent when the debit is rejected for insufficient balance', async () => {
    const { tx, writes } = createFakeTx(100);

    await assert.rejects(
      () =>
        service.debitWallet(
          {
            userId: 'vendor-1',
            amount: 900,
            type: WalletTransactionType.ORDER_PAYMENT,
            financialEvent: {
              eventType: 'ORDER_PLACEMENT_DEBIT',
              referenceType: 'ORDER',
              referenceId: 'order-1',
            },
          },
          tx,
        ),
      /Insufficient wallet balance/,
    );

    assert.equal(writes.walletUpdate.length, 0);
    assert.equal(writes.financialEvent.length, 0, 'no ledger row for a movement that never happened');
  });

  it('records an amendment debit against the amendment, not the order', async () => {
    const { tx, writes } = createFakeTx(5000);

    await service.debitWallet(
      {
        userId: 'vendor-1',
        amount: 250,
        type: WalletTransactionType.ADJUSTMENT,
        productionOrderId: 'order-1',
        financialEvent: {
          eventType: 'AMENDMENT_DEBIT',
          referenceType: 'AMENDMENT',
          referenceId: 'amendment-7',
          createdByUserId: 'staff-1',
        },
      },
      tx,
    );

    const event = writes.financialEvent[0]!;
    assert.equal(event.eventType, 'AMENDMENT_DEBIT');
    assert.equal(event.referenceType, 'AMENDMENT');
    assert.equal(event.referenceId, 'amendment-7');
  });

  it('falls back to the WalletTransaction id when no business reference is given (admin adjustments)', async () => {
    const { tx, writes } = createFakeTx(5000);

    await service.debitWallet(
      {
        userId: 'vendor-1',
        amount: 400,
        type: WalletTransactionType.ADMIN_DEBIT,
        createdById: 'staff-9',
        financialEvent: {
          eventType: 'WALLET_ADMIN_DEBIT',
          referenceType: 'WALLET_ADJUSTMENT',
          createdByUserId: 'staff-9',
        },
      },
      tx,
    );

    const event = writes.financialEvent[0]!;
    assert.equal(event.eventType, 'WALLET_ADMIN_DEBIT');
    assert.equal(event.referenceType, 'WALLET_ADJUSTMENT');
    assert.equal(event.referenceId, 'wallet-tx-1');
  });
});

describe('walletLedgerService.creditWallet — FinancialEvent coverage', () => {
  it('writes exactly one CREDIT-direction FinancialEvent for a top-up', async () => {
    const { tx, writes } = createFakeTx(0);

    await service.creditWallet(
      {
        userId: 'vendor-1',
        amount: 5000,
        type: WalletTransactionType.RECHARGE,
        paymentId: 'pay-1',
        auditAction: FinancialAuditAction.PAYMENT_WEBHOOK,
        financialEvent: {
          eventType: 'WALLET_TOPUP',
          referenceType: 'TOPUP',
          referenceId: 'pay-1',
        },
      },
      tx,
    );

    assert.equal(writes.financialEvent.length, 1);
    const event = writes.financialEvent[0]!;
    assert.equal(event.eventType, 'WALLET_TOPUP');
    assert.equal(event.direction, 'CREDIT');
    assert.equal(event.instrument, 'WALLET');
    assert.equal(event.referenceType, 'TOPUP');
    assert.equal(event.referenceId, 'pay-1');
    assert.equal(event.createdByUserId, null, 'a webhook-driven top-up is system-triggered');
  });

  it('records an amendment refund as AMENDMENT_CREDIT against the amendment', async () => {
    const { tx, writes } = createFakeTx(0);

    await service.creditWallet(
      {
        userId: 'vendor-1',
        amount: 175,
        type: WalletTransactionType.ADJUSTMENT,
        productionOrderId: 'order-1',
        financialEvent: {
          eventType: 'AMENDMENT_CREDIT',
          referenceType: 'AMENDMENT',
          referenceId: 'amendment-7',
          createdByUserId: 'staff-1',
        },
      },
      tx,
    );

    const event = writes.financialEvent[0]!;
    assert.equal(event.eventType, 'AMENDMENT_CREDIT');
    assert.equal(event.direction, 'CREDIT');
    assert.equal(event.referenceId, 'amendment-7');
  });

  it('writes no FinancialEvent when the credit amount is rejected', async () => {
    const { tx, writes } = createFakeTx(0);

    await assert.rejects(
      () =>
        service.creditWallet(
          {
            userId: 'vendor-1',
            amount: 0,
            type: WalletTransactionType.ADMIN_CREDIT,
            financialEvent: {
              eventType: 'WALLET_ADMIN_CREDIT',
              referenceType: 'WALLET_ADJUSTMENT',
            },
          },
          tx,
        ),
      /must be positive/,
    );

    assert.equal(writes.financialEvent.length, 0);
  });

  it('attributes an admin credit to the acting staff user', async () => {
    const { tx, writes } = createFakeTx(0);

    await service.creditWallet(
      {
        userId: 'vendor-1',
        amount: 800,
        type: WalletTransactionType.ADMIN_CREDIT,
        createdById: 'staff-3',
        auditAction: FinancialAuditAction.WALLET_CREDIT,
        auditActorId: 'staff-3',
        financialEvent: {
          eventType: 'WALLET_ADMIN_CREDIT',
          referenceType: 'WALLET_ADJUSTMENT',
          createdByUserId: 'staff-3',
        },
      },
      tx,
    );

    const event = writes.financialEvent[0]!;
    assert.equal(event.eventType, 'WALLET_ADMIN_CREDIT');
    assert.equal(event.createdByUserId, 'staff-3');
    assert.equal(event.referenceId, 'wallet-tx-1');
  });
});

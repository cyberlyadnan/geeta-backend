import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DesignApprovalService, type DesignApprovalDb } from '../design-approval.service.js';
import { workflowEngine } from '../../workflow/workflow.engine.js';
import { NotificationDispatchService } from '../../../services/notifications/index.js';
import { DESIGN_STEP_CODES } from '../design-approval.constants.js';

/**
 * Checklist item: "Wallet is debited once, at order placement, regardless of how many revision
 * rounds occur."
 *
 * The transaction client below is a Proxy that throws the moment anything financial is touched —
 * wallet, walletTransaction, financialEvent, creditAccount, payment. So this does not merely
 * assert that today's code happens not to bill; it fails loudly if a future change starts
 * charging for revisions.
 */
const FINANCIAL_MODELS = new Set([
  'wallet',
  'walletTransaction',
  'walletBalanceSnapshot',
  'financialEvent',
  'financialAuditLog',
  'creditAccount',
  'creditTransaction',
  'payment',
  'invoice',
]);

function createBillingTripwireDb(state: { revisionCount: number; status: string }) {
  const touchedFinancialModels: string[] = [];

  const baseTx: Record<string, unknown> = {
    designTask: {
      findUnique: async () => ({
        id: 'design-1',
        orderId: 'order-1',
        status: state.status,
        order: { id: 'order-1', orderNumber: 'GP-2026-000001', customerId: 'vendor-1' },
        _count: { proofs: state.revisionCount },
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (typeof data.status === 'string') state.status = data.status;
        const inc = data.revisionCount as { increment?: number } | undefined;
        if (inc?.increment) state.revisionCount += inc.increment;
        return { id: 'design-1', ...data };
      },
    },
    designProofVersion: { create: async () => ({ id: 'proof' }) },
    designApprovalDecision: { create: async () => ({ id: 'decision' }) },
    userNotification: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'notif',
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body ?? null,
      }),
    },
    productionOrderEvent: { create: async () => ({ id: 'evt' }) },
    user: { findMany: async () => [{ id: 'designer-1' }] },
  };

  const tx = new Proxy(baseTx, {
    get(target, prop: string) {
      if (FINANCIAL_MODELS.has(prop)) {
        touchedFinancialModels.push(prop);
        throw new Error(`Revision rounds must never touch ${prop} — the order was paid at placement`);
      }
      return target[prop];
    },
  });

  const db: DesignApprovalDb = {
    designTask: baseTx.designTask as DesignApprovalDb['designTask'],
    designProofVersion: baseTx.designProofVersion as DesignApprovalDb['designProofVersion'],
    productionOrder: {
      findUnique: (async () => ({
        id: 'order-1',
        orderNumber: 'GP-2026-000001',
        customerId: 'vendor-1',
        designTask: { id: 'design-1', revisionCount: state.revisionCount },
      })) as DesignApprovalDb['productionOrder']['findUnique'],
    } as DesignApprovalDb['productionOrder'],
    user: baseTx.user as DesignApprovalDb['user'],
    $transaction: (async (fn: (t: unknown) => Promise<unknown>) =>
      fn(tx)) as DesignApprovalDb['$transaction'],
  };

  return { db, touchedFinancialModels };
}

describe('revision rounds never re-charge the customer', () => {
  it('survives three proof revision rounds with no financial write of any kind', async (t) => {
    const state = { revisionCount: 0, status: 'AWAITING_VENDOR_APPROVAL' };
    const { db, touchedFinancialModels } = createBillingTripwireDb(state);
    const notifier = new NotificationDispatchService(() => {});

    t.mock.method(workflowEngine, 'findOpenVendorApprovalTask', async () => ({
      taskId: 'task-gate',
      workflowInstanceId: 'wf-1',
      stepCode: DESIGN_STEP_CODES.PROOF_APPROVAL,
      stepName: 'Digital proof approval',
      stepOrder: 2,
    }));
    t.mock.method(workflowEngine, 'rejectVendorApproval', async () => ({
      targetTaskId: 'task-design',
      targetStepCode: DESIGN_STEP_CODES.DESIGN,
      reworkRequestId: 'rw',
    }));

    const service = new DesignApprovalService(db, notifier);

    for (let round = 1; round <= 3; round += 1) {
      await service.recordVendorDecision({
        orderId: 'order-1',
        approved: false,
        revisionNote: `Round ${round}: please adjust the spacing`,
        vendorUserId: 'vendor-1',
      });

      await service.submitProof({
        designTaskId: 'design-1',
        proofUrl: `https://cdn.example/proof-v${round + 1}.png`,
        submittedByUserId: 'designer-1',
      });
    }

    assert.equal(state.revisionCount, 3, 'three rounds were recorded');
    assert.deepEqual(touchedFinancialModels, [], 'no wallet, ledger or invoice write happened');
  });

  it('does not bill on final approval either', async (t) => {
    const state = { revisionCount: 2, status: 'AWAITING_VENDOR_APPROVAL' };
    const { db, touchedFinancialModels } = createBillingTripwireDb(state);
    const notifier = new NotificationDispatchService(() => {});

    t.mock.method(workflowEngine, 'findOpenVendorApprovalTask', async () => ({
      taskId: 'task-gate',
      workflowInstanceId: 'wf-1',
      stepCode: DESIGN_STEP_CODES.SAMPLE_APPROVAL,
      stepName: 'Physical sample approval',
      stepOrder: 4,
    }));
    t.mock.method(workflowEngine, 'advance', async () => ({
      workflowInstanceId: 'wf-1',
      taskId: 'task-gate',
      taskStatus: 'COMPLETED',
      newlyReadyTaskIds: ['task-full-production'],
      workflowStatus: 'RUNNING',
      workflowCompleted: false,
    }));

    const service = new DesignApprovalService(db, notifier);
    const result = await service.recordVendorDecision({
      orderId: 'order-1',
      approved: true,
      vendorUserId: 'vendor-1',
    });

    assert.equal(result.approved, true);
    assert.deepEqual(touchedFinancialModels, [], 'approval starts production, it does not bill');
  });
});

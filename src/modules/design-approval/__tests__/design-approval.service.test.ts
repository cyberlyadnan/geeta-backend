import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DesignApprovalService, type DesignApprovalDb } from '../design-approval.service.js';
import { workflowEngine } from '../../workflow/workflow.engine.js';
import { NotificationDispatchService } from '../../../services/notifications/index.js';
import { DESIGN_STEP_CODES } from '../design-approval.constants.js';

interface FakeState {
  designTask: {
    id: string;
    status: string;
    proofUrl: string | null;
    revisionCount: number;
    proofCount: number;
  } | null;
  customerId: string | null;
}

/** Hand-rolled fake — node:test's mock.method cannot patch Prisma's proxy-based model
 *  delegates (see retail-customer.service tests), so the service takes an injectable db. */
function createFakeDb(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    designTask: { id: 'design-1', status: 'PENDING', proofUrl: null, revisionCount: 0, proofCount: 0 },
    customerId: 'vendor-1',
    ...overrides,
  };

  const calls = {
    designTaskCreates: [] as Array<Record<string, unknown>>,
    designTaskUpdates: [] as Array<Record<string, unknown>>,
    proofCreates: [] as Array<Record<string, unknown>>,
    decisionCreates: [] as Array<Record<string, unknown>>,
    notificationCreates: [] as Array<Record<string, unknown>>,
    orderEvents: [] as Array<Record<string, unknown>>,
  };

  const tx = {
    designTask: {
      findUnique: async () =>
        state.designTask
          ? {
              ...state.designTask,
              orderId: 'order-1',
              order: { id: 'order-1', orderNumber: 'GP-2026-000001', customerId: state.customerId },
              _count: { proofs: state.designTask.proofCount },
            }
          : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.designTaskCreates.push(data);
        return { id: 'design-new', source: data.source };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        calls.designTaskUpdates.push(data);
        if (state.designTask) {
          if (typeof data.status === 'string') state.designTask.status = data.status;
          if (typeof data.proofUrl === 'string') state.designTask.proofUrl = data.proofUrl;
          const inc = data.revisionCount as { increment?: number } | undefined;
          if (inc?.increment) state.designTask.revisionCount += inc.increment;
        }
        return { ...state.designTask, ...data };
      },
    },
    designProofVersion: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.proofCreates.push(data);
        if (state.designTask) state.designTask.proofCount += 1;
        return { id: 'proof-1', ...data };
      },
    },
    designApprovalDecision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.decisionCreates.push(data);
        return { id: 'decision-1', ...data };
      },
    },
    userNotification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.notificationCreates.push(data);
        return {
          id: `notif-${calls.notificationCreates.length}`,
          userId: data.userId,
          type: data.type,
          title: data.title,
          body: data.body ?? null,
        };
      },
    },
    productionOrderEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.orderEvents.push(data);
        return { id: 'evt-1', ...data };
      },
    },
    user: {
      findMany: async () => [{ id: 'designer-1' }, { id: 'designer-2' }],
    },
  };

  const db: DesignApprovalDb = {
    designTask: tx.designTask as unknown as DesignApprovalDb['designTask'],
    designProofVersion: tx.designProofVersion as unknown as DesignApprovalDb['designProofVersion'],
    productionOrder: {
      findUnique: (async () => ({
        id: 'order-1',
        orderNumber: 'GP-2026-000001',
        customerId: state.customerId,
        designTask: state.designTask
          ? { id: state.designTask.id, revisionCount: state.designTask.revisionCount }
          : null,
      })) as DesignApprovalDb['productionOrder']['findUnique'],
    } as DesignApprovalDb['productionOrder'],
    user: tx.user as unknown as DesignApprovalDb['user'],
    $transaction: (async (fn: (t: unknown) => Promise<unknown>) =>
      fn(tx)) as DesignApprovalDb['$transaction'],
  };

  return { db, tx, state, calls };
}

function stubOpenGate(t: import('node:test').TestContext, stepCode: string) {
  return t.mock.method(workflowEngine, 'findOpenVendorApprovalTask', async () => ({
    taskId: 'task-gate',
    workflowInstanceId: 'wf-1',
    stepCode,
    stepName: stepCode === DESIGN_STEP_CODES.SAMPLE_APPROVAL ? 'Physical sample approval' : 'Digital proof approval',
    stepOrder: stepCode === DESIGN_STEP_CODES.SAMPLE_APPROVAL ? 4 : 2,
  }));
}

describe('createForOrder — DesignTask is created only when there is design work to do', () => {
  it('creates a VENDOR_MATTER task when the vendor supplied no artwork', async () => {
    const { db, calls } = createFakeDb();
    const service = new DesignApprovalService(db);

    const task = await service.createForOrder({
      orderId: 'order-1',
      hasArtwork: false,
      matterContent: 'Bride: Anita, Groom: Ravi, 12 Feb',
    });

    assert.ok(task);
    assert.equal(calls.designTaskCreates.length, 1);
    assert.equal(calls.designTaskCreates[0]!.source, 'VENDOR_MATTER');
    assert.equal(calls.designTaskCreates[0]!.status, 'PENDING');
    assert.equal(calls.designTaskCreates[0]!.matterContent, 'Bride: Anita, Groom: Ravi, 12 Feb');
  });

  it('skips the design task entirely when artwork was supplied', async () => {
    const { db, calls } = createFakeDb();
    const service = new DesignApprovalService(db);

    const task = await service.createForOrder({ orderId: 'order-1', hasArtwork: true });

    assert.equal(task, null);
    assert.equal(calls.designTaskCreates.length, 0, 'no design task for a print-ready order');
  });
});

describe('submitProof — the design team sends work to the customer', () => {
  it('moves the task to AWAITING_VENDOR_APPROVAL and records a numbered proof version', async (t) => {
    const { db, calls } = createFakeDb();
    const service = new DesignApprovalService(db);

    const result = await service.submitProof({
      designTaskId: 'design-1',
      proofUrl: 'https://cdn.example/proof-v1.png',
      submittedByUserId: 'designer-1',
    });

    assert.equal(result.versionNumber, 1);
    assert.equal(calls.proofCreates.length, 1);
    assert.equal(calls.proofCreates[0]!.versionNumber, 1);
    assert.equal(calls.designTaskUpdates[0]!.status, 'AWAITING_VENDOR_APPROVAL');
    assert.equal(calls.designTaskUpdates[0]!.proofUrl, 'https://cdn.example/proof-v1.png');
  });

  it('numbers a second proof v2 rather than overwriting v1', async (t) => {
    const { db, calls } = createFakeDb({
      designTask: { id: 'design-1', status: 'REVISION_REQUESTED', proofUrl: 'v1', revisionCount: 1, proofCount: 1 },
    });
    const service = new DesignApprovalService(db);

    const result = await service.submitProof({
      designTaskId: 'design-1',
      proofUrl: 'https://cdn.example/proof-v2.png',
      submittedByUserId: 'designer-1',
    });

    assert.equal(result.versionNumber, 2);
    assert.equal(calls.proofCreates[0]!.versionNumber, 2);
  });

  it('refuses to submit against an already-approved design', async (t) => {
    const { db } = createFakeDb({
      designTask: { id: 'design-1', status: 'APPROVED', proofUrl: 'v1', revisionCount: 0, proofCount: 1 },
    });
    const service = new DesignApprovalService(db);

    await assert.rejects(
      () =>
        service.submitProof({
          designTaskId: 'design-1',
          proofUrl: 'https://cdn.example/x.png',
          submittedByUserId: 'designer-1',
        }),
      /already been approved/,
    );
  });
});

describe('notifications actually fire — not just get logged', () => {
  it('pushes the proof-ready notification to the customer over the socket', async (t) => {
    const { db, calls } = createFakeDb();
    const emitted: Array<{ userId: string; payload: Record<string, unknown> }> = [];
    const notifier = new NotificationDispatchService((userId, payload) => {
      emitted.push({ userId, payload: payload as unknown as Record<string, unknown> });
    });

    const service = new DesignApprovalService(db, notifier);
    await service.submitProof({
      designTaskId: 'design-1',
      proofUrl: 'https://cdn.example/proof-v1.png',
      submittedByUserId: 'designer-1',
    });

    assert.equal(calls.notificationCreates.length, 1, 'a durable notification row was written');
    assert.equal(emitted.length, 1, 'and it was actually pushed, not merely stored');
    assert.equal(emitted[0]!.userId, 'vendor-1');
    assert.equal(emitted[0]!.payload.type, 'DESIGN_PROOF_READY');
    assert.match(String(emitted[0]!.payload.title), /proof is ready/i);
  });

  it('pushes to the design team when the customer requests changes at the proof gate', async (t) => {
    const { db, tx, calls } = createFakeDb();
    const emitted: string[] = [];
    const notifier = new NotificationDispatchService((userId) => {
      emitted.push(userId);
    });
    stubOpenGate(t, DESIGN_STEP_CODES.PROOF_APPROVAL);
    t.mock.method(workflowEngine, 'rejectVendorApproval', async () => ({
      targetTaskId: 'task-design',
      targetStepCode: DESIGN_STEP_CODES.DESIGN,
      reworkRequestId: 'rw-1',
    }));

    const service = new DesignApprovalService(db, notifier);
    await service.recordVendorDecision({
      orderId: 'order-1',
      approved: false,
      revisionNote: 'Please make the names larger',
      vendorUserId: 'vendor-1',
    });

    assert.equal(calls.notificationCreates.length, 2, 'both designers get a row');
    assert.deepEqual(emitted, ['designer-1', 'designer-2'], 'and both are pushed live');
  });

  it('pushes at the SAMPLE gate too, not just the proof gate', async (t) => {
    const { db, tx, calls } = createFakeDb();
    const emitted: string[] = [];
    const notifier = new NotificationDispatchService((userId) => {
      emitted.push(userId);
    });
    stubOpenGate(t, DESIGN_STEP_CODES.SAMPLE_APPROVAL);
    t.mock.method(workflowEngine, 'rejectVendorApproval', async () => ({
      targetTaskId: 'task-design',
      targetStepCode: DESIGN_STEP_CODES.DESIGN,
      reworkRequestId: 'rw-2',
    }));

    const service = new DesignApprovalService(db, notifier);
    const result = await service.recordVendorDecision({
      orderId: 'order-1',
      approved: false,
      revisionNote: 'Card stock feels too thin',
      vendorUserId: 'vendor-1',
    });

    assert.equal(result.gate, 'PHYSICAL_SAMPLE');
    assert.equal(calls.notificationCreates.length, 2);
    assert.equal(emitted.length, 2, 'the sample gate notifies just as reliably as the proof gate');
  });

  it('still records the notification when the socket push fails', async (t) => {
    const { db, calls } = createFakeDb();
    const notifier = new NotificationDispatchService(() => {
      throw new Error('Socket.io not initialized');
    });

    const service = new DesignApprovalService(db, notifier);
    // A dead socket must not fail the business operation — the row is already durable.
    await service.submitProof({
      designTaskId: 'design-1',
      proofUrl: 'https://cdn.example/proof-v1.png',
      submittedByUserId: 'designer-1',
    });

    assert.equal(calls.notificationCreates.length, 1);
  });
});

describe('vendor decisions at the digital proof gate', () => {
  it('rejecting routes back to design, increments revisionCount, and does not advance', async (t) => {
    const { db, tx, calls, state } = createFakeDb();
    stubOpenGate(t, DESIGN_STEP_CODES.PROOF_APPROVAL);
    const advance = t.mock.method(workflowEngine, 'advance', async () => {
      throw new Error('a rejected gate must never advance the workflow');
    });
    const reject = t.mock.method(workflowEngine, 'rejectVendorApproval', async () => ({
      targetTaskId: 'task-design',
      targetStepCode: DESIGN_STEP_CODES.DESIGN,
      reworkRequestId: 'rw-1',
    }));

    const service = new DesignApprovalService(db);
    const result = await service.recordVendorDecision({
      orderId: 'order-1',
      approved: false,
      revisionNote: 'Names too small',
      vendorUserId: 'vendor-1',
    });

    assert.equal(result.approved, false);
    assert.equal(result.advanced, false);
    assert.equal(result.routedBackToStepCode, DESIGN_STEP_CODES.DESIGN);
    assert.equal(result.revisionCount, 1);
    assert.equal(state.designTask!.revisionCount, 1, 'revisionCount incremented');
    assert.equal(state.designTask!.status, 'REVISION_REQUESTED');
    assert.equal(advance.mock.callCount(), 0, 'production did not advance');
    assert.equal(reject.mock.callCount(), 1);
    assert.equal(calls.decisionCreates[0]!.approved, false);
    assert.equal(calls.decisionCreates[0]!.gate, 'DIGITAL_PROOF');
  });

  it('approving advances the workflow to sample production', async (t) => {
    const { db, tx, calls } = createFakeDb();
    stubOpenGate(t, DESIGN_STEP_CODES.PROOF_APPROVAL);
    const advance = t.mock.method(workflowEngine, 'advance', async () => ({
      workflowInstanceId: 'wf-1',
      taskId: 'task-gate',
      taskStatus: 'COMPLETED',
      newlyReadyTaskIds: ['task-sample'],
      workflowStatus: 'RUNNING',
      workflowCompleted: false,
    }));

    const service = new DesignApprovalService(db);
    const result = await service.recordVendorDecision({
      orderId: 'order-1',
      approved: true,
      vendorUserId: 'vendor-1',
    });

    assert.equal(result.approved, true);
    assert.equal(result.advanced, true);
    assert.deepEqual(result.newlyReadyTaskIds, ['task-sample']);
    assert.equal(advance.mock.callCount(), 1);
    assert.equal(advance.mock.calls[0]!.arguments[0].action, 'complete');
    assert.equal(calls.decisionCreates[0]!.gate, 'DIGITAL_PROOF');
    // Passing the proof gate must NOT mark the whole design approved — the sample gate is next.
    const statusUpdates = calls.designTaskUpdates.filter((u) => u.status === 'APPROVED');
    assert.equal(statusUpdates.length, 0);
  });
});

describe('vendor decisions at the physical sample gate', () => {
  it('rejecting the sample routes back and does not advance to full production', async (t) => {
    const { db, tx, state } = createFakeDb({
      designTask: { id: 'design-1', status: 'AWAITING_VENDOR_APPROVAL', proofUrl: 'v1', revisionCount: 1, proofCount: 1 },
    });
    stubOpenGate(t, DESIGN_STEP_CODES.SAMPLE_APPROVAL);
    const advance = t.mock.method(workflowEngine, 'advance', async () => {
      throw new Error('a rejected sample must never start full production');
    });
    t.mock.method(workflowEngine, 'rejectVendorApproval', async () => ({
      targetTaskId: 'task-design',
      targetStepCode: DESIGN_STEP_CODES.DESIGN,
      reworkRequestId: 'rw-2',
    }));

    const service = new DesignApprovalService(db);
    const result = await service.recordVendorDecision({
      orderId: 'order-1',
      approved: false,
      revisionNote: 'Colour is off',
      vendorUserId: 'vendor-1',
    });

    assert.equal(result.gate, 'PHYSICAL_SAMPLE');
    assert.equal(result.advanced, false);
    assert.equal(result.revisionCount, 2, 'revision rounds accumulate across both gates');
    assert.equal(state.designTask!.revisionCount, 2);
    assert.equal(advance.mock.callCount(), 0);
  });

  it('approving the sample marks the design APPROVED and advances to full production', async (t) => {
    const { db, tx, calls, state } = createFakeDb({
      designTask: { id: 'design-1', status: 'AWAITING_VENDOR_APPROVAL', proofUrl: 'v1', revisionCount: 1, proofCount: 1 },
    });
    stubOpenGate(t, DESIGN_STEP_CODES.SAMPLE_APPROVAL);
    const advance = t.mock.method(workflowEngine, 'advance', async () => ({
      workflowInstanceId: 'wf-1',
      taskId: 'task-gate',
      taskStatus: 'COMPLETED',
      newlyReadyTaskIds: ['task-full-production'],
      workflowStatus: 'RUNNING',
      workflowCompleted: false,
    }));

    const service = new DesignApprovalService(db);
    const result = await service.recordVendorDecision({
      orderId: 'order-1',
      approved: true,
      vendorUserId: 'vendor-1',
    });

    assert.equal(result.gate, 'PHYSICAL_SAMPLE');
    assert.deepEqual(result.newlyReadyTaskIds, ['task-full-production']);
    assert.equal(advance.mock.callCount(), 1);
    assert.equal(state.designTask!.status, 'APPROVED', 'the final gate closes the design out');
    assert.equal(calls.decisionCreates[0]!.gate, 'PHYSICAL_SAMPLE');
  });
});

describe('guards', () => {
  it('rejects a decision when no gate is open', async (t) => {
    const { db } = createFakeDb();
    t.mock.method(workflowEngine, 'findOpenVendorApprovalTask', async () => null);

    const service = new DesignApprovalService(db);
    await assert.rejects(
      () => service.recordVendorDecision({ orderId: 'order-1', approved: true, vendorUserId: 'vendor-1' }),
      /nothing waiting for your approval/,
    );
  });

  it("rejects a decision on someone else's order", async (t) => {
    const { db } = createFakeDb({ customerId: 'other-vendor' });
    stubOpenGate(t, DESIGN_STEP_CODES.PROOF_APPROVAL);

    const service = new DesignApprovalService(db);
    await assert.rejects(
      () => service.recordVendorDecision({ orderId: 'order-1', approved: true, vendorUserId: 'vendor-1' }),
      /does not belong to you/,
    );
  });

  it('requires a note when requesting changes', async (t) => {
    const { db } = createFakeDb();
    stubOpenGate(t, DESIGN_STEP_CODES.PROOF_APPROVAL);

    const service = new DesignApprovalService(db);
    await assert.rejects(
      () =>
        service.recordVendorDecision({
          orderId: 'order-1',
          approved: false,
          revisionNote: '   ',
          vendorUserId: 'vendor-1',
        }),
      /what to change/,
    );
  });
});

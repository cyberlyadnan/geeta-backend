import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProductionOrderStatus, WorkflowTaskStatus } from '@prisma/client';
import { resolveActor, type AdminOrdersDb } from '../../admin-orders/admin-orders.service.js';
import type { RetailCustomerService } from '../../admin-retail-customers/retail-customer.service.js';
import { checkOrderAmendable } from '../order-amendment-gate.js';

/**
 * Gaps found during the Phase 0–4 stabilization pass (2026-08-05).
 *
 * Each test here maps to a "Testing checklist" line in docs/features/02 or 03 that had no
 * automated coverage. See docs/audits/phase0-4-bug-log.md for the reconciliation table.
 */

// ── Phase 1: "Admin creates an order for an existing vendor — createdByActorId recorded" ────

describe('Phase 1 checklist — admin-created order records who placed it', () => {
  it('passes the staff user id through as createdByActorId for a vendor order', async () => {
    const captured: Array<{ actor: unknown; createdByActorId: unknown }> = [];
    const fakeOrders = {
      create: async (actor: unknown, _input: unknown, createdByActorId: string | null) => {
        captured.push({ actor, createdByActorId });
        return { orderId: 'order-1' };
      },
    };

    const db: AdminOrdersDb = {
      user: {
        findFirst: (async () => ({ id: 'vendor-1', vendorProfile: { id: 'vp-1' } })) as AdminOrdersDb['user']['findFirst'],
      } as AdminOrdersDb['user'],
    };

    const actor = await resolveActor({ type: 'vendor', vendorId: 'vendor-1' }, 'staff-9', { db });
    await fakeOrders.create(actor, {}, 'staff-9');

    assert.deepEqual(captured[0]!.actor, { type: 'vendor', vendorUserId: 'vendor-1' });
    assert.equal(
      captured[0]!.createdByActorId,
      'staff-9',
      'the staff member who placed it must be recorded on the order',
    );
  });

  it('rejects a "vendor" order for a user that has no vendor profile', async () => {
    const db: AdminOrdersDb = {
      user: {
        // A real user row, but not a vendor.
        findFirst: (async () => null) as AdminOrdersDb['user']['findFirst'],
      } as AdminOrdersDb['user'],
    };
    await assert.rejects(
      () => resolveActor({ type: 'vendor', vendorId: 'customer-1' }, 'staff-1', { db }),
      /Vendor not found/,
    );
  });
});

// ── Phase 1: "Admin creates order for a new phone / no duplicate on the second order" ───────

describe('Phase 1 checklist — retail customer is created once and reused by phone', () => {
  function createRetailStub() {
    const store = new Map<string, { id: string; phone: string }>();
    let created = 0;
    const service = {
      findOrCreate: async (input: { name: string; phone: string }) => {
        const existing = store.get(input.phone);
        if (existing) return existing;
        created += 1;
        const row = { id: `retail-${created}`, phone: input.phone };
        store.set(input.phone, row);
        return row;
      },
    } as unknown as RetailCustomerService;
    return { service, createdCount: () => created };
  }

  it('creates a RetailCustomer inline on the first order for a phone number', async () => {
    const { service, createdCount } = createRetailStub();
    const actor = await resolveActor(
      { type: 'retail', phone: '9800000001', name: 'Walk-in Asha' },
      'staff-1',
      { retailCustomers: service },
    );
    assert.deepEqual(actor, { type: 'retail', retailCustomerId: 'retail-1' });
    assert.equal(createdCount(), 1);
  });

  it('reuses the same customer on a second order with the same phone — no duplicate', async () => {
    const { service, createdCount } = createRetailStub();
    const first = await resolveActor(
      { type: 'retail', phone: '9800000001', name: 'Walk-in Asha' },
      'staff-1',
      { retailCustomers: service },
    );
    const second = await resolveActor(
      // Deliberately a different spelling of the name — phone is the identity.
      { type: 'retail', phone: '9800000001', name: 'Asha K' },
      'staff-2',
      { retailCustomers: service },
    );

    assert.deepEqual(first, second);
    assert.equal(createdCount(), 1, 'a second order must not create a second customer row');
  });

  it('creates separate customers for different phone numbers', async () => {
    const { service, createdCount } = createRetailStub();
    const a = await resolveActor({ type: 'retail', phone: '9800000001', name: 'A' }, 's1', { retailCustomers: service });
    const b = await resolveActor({ type: 'retail', phone: '9800000002', name: 'B' }, 's1', { retailCustomers: service });
    assert.notDeepEqual(a, b);
    assert.equal(createdCount(), 2);
  });
});

// ── Phase 1: "Amending an order in a non-editable workflow state is rejected" ───────────────
// The gate has its own suite; these cover the states that suite does not.

describe('Phase 1 checklist — amendment gate covers every terminal state', () => {
  const noTasks: Parameters<typeof checkOrderAmendable>[0]['workflowTasks'] = [];

  for (const status of [
    ProductionOrderStatus.CANCELLED,
    ProductionOrderStatus.CANCELLATION_REQUESTED,
    ProductionOrderStatus.COMPLETED,
    ProductionOrderStatus.DISPATCHED,
    ProductionOrderStatus.DELIVERED,
  ]) {
    it(`rejects an order in ${status}`, () => {
      const result = checkOrderAmendable({ orderStatus: status, workflowTasks: noTasks });
      assert.equal(result.amendable, false);
      assert.match(result.reason ?? '', /can no longer be amended/);
    });
  }

  it('allows amendment while production has not reached the locking step', () => {
    const result = checkOrderAmendable({
      orderStatus: ProductionOrderStatus.IN_PRODUCTION,
      workflowTasks: [
        { status: WorkflowTaskStatus.COMPLETED, workflowStep: { locksAmendmentsOnStart: false, stepName: 'Design' } },
        { status: WorkflowTaskStatus.READY, workflowStep: { locksAmendmentsOnStart: true, stepName: 'Printing' } },
      ],
    });
    assert.equal(result.amendable, true, 'a queued locking step has not started yet');
  });

  it('names the specific step that closed the window', () => {
    const result = checkOrderAmendable({
      orderStatus: ProductionOrderStatus.IN_PRODUCTION,
      workflowTasks: [
        { status: WorkflowTaskStatus.IN_PROGRESS, workflowStep: { locksAmendmentsOnStart: true, stepName: 'Foiling' } },
      ],
    });
    assert.equal(result.amendable, false);
    assert.match(result.reason ?? '', /Foiling/, 'the message must tell staff which step blocked it');
  });
});

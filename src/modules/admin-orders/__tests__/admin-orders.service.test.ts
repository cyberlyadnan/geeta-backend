import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RetailCustomerService } from '../../admin-retail-customers/retail-customer.service.js';
import { resolveActor, type AdminOrdersDb } from '../admin-orders.service.js';

describe('resolveActor — 1B admin-created orders', () => {
  it('resolves an existing vendor to a vendor actor, customerId set', async () => {
    const db: AdminOrdersDb = {
      user: {
        findFirst: (async ({ where }: { where: { id: string } }) =>
          where.id === 'vendor-1'
            ? { id: 'vendor-1', vendorProfile: { id: 'vp-1' } }
            : null) as AdminOrdersDb['user']['findFirst'],
      } as AdminOrdersDb['user'],
    };

    const actor = await resolveActor({ type: 'vendor', vendorId: 'vendor-1' }, 'staff-1', { db });
    assert.deepEqual(actor, { type: 'vendor', vendorUserId: 'vendor-1' });
  });

  it('rejects an unknown or non-vendor user id', async () => {
    const db: AdminOrdersDb = {
      user: {
        findFirst: (async () => null) as AdminOrdersDb['user']['findFirst'],
      } as AdminOrdersDb['user'],
    };

    await assert.rejects(() => resolveActor({ type: 'vendor', vendorId: 'nope' }, 'staff-1', { db }));
  });

  it('resolves a retail actor via findOrCreate, vendorId stays unset', async () => {
    const fakeRetailCustomers = {
      findOrCreate: async () => ({
        id: 'retail-1',
        name: 'Adnan',
        phone: '9999900000',
        hasGst: false,
        gstNumber: null,
        createdById: 'staff-1',
        createdAt: new Date(),
      }),
    } as unknown as RetailCustomerService;

    const actor = await resolveActor(
      { type: 'retail', phone: '9999900000', name: 'Adnan' },
      'staff-1',
      { retailCustomers: fakeRetailCustomers },
    );

    assert.deepEqual(actor, { type: 'retail', retailCustomerId: 'retail-1' });
  });
});

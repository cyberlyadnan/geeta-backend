import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RetailCustomerService, type RetailCustomerDb } from '../retail-customer.service.js';

/**
 * A plain hand-rolled fake, not a mocked Prisma client — node:test's mock.method cannot patch
 * Prisma's proxy-based model delegates (their methods aren't real own/prototype properties, so
 * mock.method throws "must be a method. Received undefined"). RetailCustomerService takes an
 * injectable db slice for exactly this reason.
 */
function createFakeDb() {
  let rows: Array<{
    id: string;
    name: string;
    phone: string;
    hasGst: boolean;
    gstNumber: string | null;
    createdById: string;
    createdAt: Date;
  }> = [];
  let nextId = 1;
  let findFirstCalls = 0;
  let createCalls = 0;

  const db: RetailCustomerDb = {
    retailCustomer: {
      findFirst: (async ({ where }: { where: { phone: string } }) => {
        findFirstCalls += 1;
        return rows.find((r) => r.phone === where.phone) ?? null;
      }) as RetailCustomerDb['retailCustomer']['findFirst'],
      create: (async ({ data }: { data: Record<string, unknown> }) => {
        createCalls += 1;
        const row = {
          id: `retail-${nextId++}`,
          name: data['name'] as string,
          phone: data['phone'] as string,
          hasGst: data['hasGst'] as boolean,
          gstNumber: (data['gstNumber'] as string) ?? null,
          createdById: data['createdById'] as string,
          createdAt: new Date(),
        };
        rows.push(row);
        return row;
      }) as RetailCustomerDb['retailCustomer']['create'],
    } as RetailCustomerDb['retailCustomer'],
  };

  return { db, findFirstCalls: () => findFirstCalls, createCalls: () => createCalls };
}

describe('RetailCustomerService.findOrCreate — dedup by phone', () => {
  it('creates once for a new phone, then reuses that same customer on every later lookup', async () => {
    const { db, createCalls, findFirstCalls } = createFakeDb();
    const service = new RetailCustomerService(db);

    const first = await service.findOrCreate({ name: 'Adnan', phone: '9999900000' }, 'staff-1');
    assert.equal(createCalls(), 1);
    assert.equal(first.name, 'Adnan');

    const second = await service.findOrCreate(
      { name: 'Adnan (typed slightly differently)', phone: '9999900000' },
      'staff-1',
    );
    assert.equal(createCalls(), 1, 'create must not be called again for the same phone');
    assert.equal(second.id, first.id);
    assert.equal(findFirstCalls(), 2);
  });

  it('different phone numbers create separate customers', async () => {
    const { db, createCalls } = createFakeDb();
    const service = new RetailCustomerService(db);

    const a = await service.findOrCreate({ name: 'Adnan', phone: '1111100000' }, 'staff-1');
    const b = await service.findOrCreate({ name: 'Someone Else', phone: '2222200000' }, 'staff-1');

    assert.equal(createCalls(), 2);
    assert.notEqual(a.id, b.id);
  });
});

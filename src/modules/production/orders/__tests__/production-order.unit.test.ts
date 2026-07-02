import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { RoleName } from '@prisma/client';
import {
  assertCanViewProductionOrders,
  canManageProductionOrders,
  canViewProductionOrders,
} from '../production-order.access.js';
import { listProductionOrdersQuerySchema } from '../production-order.validation.js';

describe('production-order.access', () => {
  it('allows managers to view production orders', () => {
    assert.equal(canViewProductionOrders(RoleName.MANAGER, []), true);
    assert.equal(canManageProductionOrders(RoleName.MANAGER, []), true);
  });

  it('allows staff with production.order.view', () => {
    assert.equal(canViewProductionOrders(RoleName.STAFF, ['production.order.view']), true);
  });

  it('allows staff with production.control.view', () => {
    assert.equal(canViewProductionOrders(RoleName.STAFF, ['production.control.view']), true);
  });

  it('denies staff without permissions', () => {
    assert.equal(canViewProductionOrders(RoleName.STAFF, []), false);
    assert.throws(() => assertCanViewProductionOrders(RoleName.STAFF, []));
  });
});

describe('production-order.validation', () => {
  it('accepts list query defaults', () => {
    const parsed = listProductionOrdersQuerySchema.parse({});
    assert.equal(parsed.limit, 25);
  });

  it('accepts payment status filter', () => {
    const parsed = listProductionOrdersQuerySchema.parse({ paymentStatus: 'PAID', rush: true });
    assert.equal(parsed.paymentStatus, 'PAID');
    assert.equal(parsed.rush, true);
  });
});

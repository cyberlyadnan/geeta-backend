import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProductionOrderStatus } from '@prisma/client';
import {
  buildAwaitingDispatchWhere,
  buildVendorOrderListStatusWhere,
} from '../vendor-order-list-filter.js';

describe('buildVendorOrderListStatusWhere', () => {
  it('maps READY_FOR_DISPATCH to awaiting-dispatch workflow filter', () => {
    const where = buildVendorOrderListStatusWhere(ProductionOrderStatus.READY_FOR_DISPATCH);
    assert.deepEqual(where, buildAwaitingDispatchWhere());
  });

  it('excludes awaiting-dispatch orders from IN_PRODUCTION tab', () => {
    const where = buildVendorOrderListStatusWhere(ProductionOrderStatus.IN_PRODUCTION);
    assert.equal(where.status, ProductionOrderStatus.IN_PRODUCTION);
    assert.ok(where.NOT);
  });

  it('maps DISPATCHED tab to dispatched status only', () => {
    const where = buildVendorOrderListStatusWhere(ProductionOrderStatus.DISPATCHED);
    assert.deepEqual(where, { status: ProductionOrderStatus.DISPATCHED });
  });
});

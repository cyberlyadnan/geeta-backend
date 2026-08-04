import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyVendorOverride, type VendorPriceOverrideRecord } from '../vendor-price-override.resolver.js';

function override(overrideType: 'REPLACE' | 'DELTA', value: number): VendorPriceOverrideRecord {
  return { id: 'ov-1', matrixCellId: null, overrideType, value };
}

describe('applyVendorOverride', () => {
  it('returns the list price unchanged when there is no override', () => {
    assert.equal(applyVendorOverride(11, null), 11);
  });

  it('REPLACE substitutes the list price outright', () => {
    // Client example: Vinyl at ₹10/sqft for vendor Adnan instead of default ₹11.
    assert.equal(applyVendorOverride(11, override('REPLACE', 10)), 10);
  });

  it('DELTA adds to the list price', () => {
    assert.equal(applyVendorOverride(100, override('DELTA', 5)), 105);
  });

  it('DELTA can also discount (negative value)', () => {
    assert.equal(applyVendorOverride(100, override('DELTA', -15)), 85);
  });
});

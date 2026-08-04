import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChargeableSize } from '../chargeable-size.resolver.js';

// Verified against the client's own examples — see docs/features/02-phase0-pricing-spine.md.
describe('resolveChargeableSize', () => {
  it('2x3 on a product with width >= 3 is valid with no rounding', () => {
    const result = resolveChargeableSize(2, 3, [3, 4, 5], 10);
    assert.equal(result.valid, true);
    assert.equal(result.wasRounded, false);
    assert.equal(result.chargedArea, result.chargedWidth! * result.chargedLength!);
  });

  it('10x4 on Vinyl (widths 3,4,5) is valid via rotation — charged 4x10, no rounding', () => {
    const result = resolveChargeableSize(10, 4, [3, 4, 5], 10);
    assert.equal(result.valid, true);
    assert.equal(result.chargedWidth, 4);
    assert.equal(result.chargedLength, 10);
    assert.equal(result.wasRounded, false);
    assert.equal(result.price, 4 * 10 * 10);
  });

  it('7x12 on widths {3,4,6,8,10} rounds up to 8x12, not 6x12', () => {
    const result = resolveChargeableSize(7, 12, [3, 4, 6, 8, 10], 10);
    assert.equal(result.valid, true);
    assert.equal(result.chargedWidth, 8);
    assert.equal(result.chargedLength, 12);
    assert.equal(result.wasRounded, true);
  });

  it('6x6 on Radium Vinyl (max width 4) is rejected — both orientations exceed max', () => {
    const result = resolveChargeableSize(6, 6, [4], 10);
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /Maximum available width for this product is 4 ft/);
  });

  it('rejects when no roll widths are configured at all', () => {
    const result = resolveChargeableSize(2, 3, [], 10);
    assert.equal(result.valid, false);
  });

  it('picks whichever valid orientation bills the smaller area', () => {
    // A 2x3 design against widths [3]: width-orientation bills 3x3=9, height-orientation bills 3x2=6.
    const result = resolveChargeableSize(2, 3, [3], 10);
    assert.equal(result.valid, true);
    assert.equal(result.chargedArea, 6);
  });
});

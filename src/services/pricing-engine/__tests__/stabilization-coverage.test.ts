import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pricingRepository } from '../../../repositories/pricing.repository.js';
import { vendorPriceOverrideRepository } from '../../../repositories/vendor-price-override.repository.js';
import { PriceResolverService } from '../price-resolver.service.js';
import { buildDimensionKeyHash } from '../matrix-pricing.resolver.js';

/**
 * Gaps found during the Phase 0–4 stabilization pass (2026-08-05), covering the two
 * docs/features/02 checklist lines that had no automated assertion:
 *
 *   - "Vendor with an override sees their price in rate catalogue, order preview, AND at order
 *      placement — all three return the identical number" (and the without-override case)
 *   - "PriceSnapshot on a placed order stores both list price and final (overridden) price"
 */

function decimal(n: number) {
  return { toNumber: () => n } as never;
}

const KEY = { gsm: '350', sheetSize: '13x19', qtyBand: '1-5' };

const MATRIX_BUNDLE = {
  id: 'version-1',
  productPrintConfig: { pricingStrategyKey: 'matrix' },
  printProcess: null,
  productTypeProfile: null,
  pricingProfileKey: null,
  ratePerSqFt: null,
  fixedPrice: null,
  quantityPricing: [
    { quantity: 1, basePrice: decimal(0), isActive: true },
    { quantity: 6, basePrice: decimal(0), isActive: true },
  ],
  configurationFields: [],
  pricingRules: [],
  priceMatrixCells: [
    {
      id: 'cell-1',
      dimensionKey: KEY,
      dimensionKeyHash: buildDimensionKeyHash(KEY),
      price: decimal(100),
      available: true,
      unavailableReason: null,
    },
  ],
  priceModifierRules: [],
  rollWidthOptions: [],
} as never;

const INPUT = {
  versionId: 'version-1',
  quantity: 1,
  selections: { gsm: '350', sheetSize: '13x19' },
};

describe('Phase 0 checklist — one number across rate catalogue, preview and placement', () => {
  it('returns an identical price for the same input however many times it is called', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => MATRIX_BUNDLE);
    t.mock.method(vendorPriceOverrideRepository, 'loadForVendorAndVersion', async () => []);
    const service = new PriceResolverService(vendorPriceOverrideRepository);

    // The three surfaces differ only in who calls resolvePrice; they pass the same input.
    const rateCatalogue = await service.resolvePrice({ ...INPUT, vendorId: 'vendor-1' });
    const orderPreview = await service.resolvePrice({ ...INPUT, vendorId: 'vendor-1' });
    const orderPlacement = await service.resolvePrice({ ...INPUT, vendorId: 'vendor-1' });

    assert.equal(rateCatalogue.finalPrice, orderPreview.finalPrice);
    assert.equal(orderPreview.finalPrice, orderPlacement.finalPrice);
    assert.equal(rateCatalogue.listPrice, orderPlacement.listPrice);
    assert.equal(rateCatalogue.finalPrice, 100, 'no override → the list price is charged');
    assert.equal(rateCatalogue.overrideApplied, false);
  });

  it('applies a vendor override identically on every surface, and only for that vendor', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => MATRIX_BUNDLE);
    t.mock.method(vendorPriceOverrideRepository, 'loadForVendorAndVersion', async (vendorId: string) =>
      vendorId === 'vendor-with-deal'
        ? [{ id: 'ov-1', overrideType: 'REPLACE', value: 72, matrixCellId: null }]
        : [],
    );
    const service = new PriceResolverService(vendorPriceOverrideRepository);

    const dealCatalogue = await service.resolvePrice({ ...INPUT, vendorId: 'vendor-with-deal' });
    const dealPreview = await service.resolvePrice({ ...INPUT, vendorId: 'vendor-with-deal' });
    const dealPlacement = await service.resolvePrice({ ...INPUT, vendorId: 'vendor-with-deal' });
    const otherVendor = await service.resolvePrice({ ...INPUT, vendorId: 'vendor-standard' });

    for (const surface of [dealCatalogue, dealPreview, dealPlacement]) {
      assert.equal(surface.finalPrice, 72, 'the negotiated price is charged everywhere');
      assert.equal(surface.listPrice, 100, 'the list price is still reported alongside it');
      assert.equal(surface.overrideApplied, true);
    }
    assert.equal(otherVendor.finalPrice, 100, "another vendor must not see someone else's price");
    assert.equal(otherVendor.overrideApplied, false);
  });

  it('an anonymous/admin preview with no vendorId never applies anyone\'s override', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => MATRIX_BUNDLE);
    const loadSpy = t.mock.method(vendorPriceOverrideRepository, 'loadForVendorAndVersion', async () => [
      { id: 'ov-x', overrideType: 'REPLACE', value: 1, matrixCellId: null },
    ]);
    const service = new PriceResolverService(vendorPriceOverrideRepository);

    const result = await service.resolvePrice(INPUT); // no vendorId

    assert.equal(loadSpy.mock.callCount(), 0, 'no override lookup without a vendor');
    assert.equal(result.finalPrice, 100);
    assert.equal(result.overrideApplied, false);
  });
});

describe('Phase 0 checklist — the snapshot payload carries both prices', () => {
  it('records listPrice, finalPrice and overrideApplied for an overridden order', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => MATRIX_BUNDLE);
    t.mock.method(vendorPriceOverrideRepository, 'loadForVendorAndVersion', async () => [
      { id: 'ov-1', overrideType: 'REPLACE', value: 72, matrixCellId: null },
    ]);
    const service = new PriceResolverService(vendorPriceOverrideRepository);

    const result = await service.resolvePrice({ ...INPUT, vendorId: 'vendor-with-deal' });

    // orders.service.ts spreads snapshotPayload into PriceSnapshot.calculation, so whatever is
    // here is what an auditor reads off a placed order months later.
    assert.equal(result.snapshotPayload.listPrice, 100, 'what it would have cost');
    assert.equal(result.snapshotPayload.finalPrice, 72, 'what was actually charged');
    assert.equal(result.snapshotPayload.overrideApplied, true);
    assert.equal(result.snapshotPayload.strategyKey, 'matrix');
    assert.equal(result.snapshotPayload.matrixCellId, 'cell-1', 'which cell priced it');
    assert.deepEqual(result.snapshotPayload.dimensionKey, KEY);
  });

  it('records the same fields when no override applies, so the shape never varies', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => MATRIX_BUNDLE);
    t.mock.method(vendorPriceOverrideRepository, 'loadForVendorAndVersion', async () => []);
    const service = new PriceResolverService(vendorPriceOverrideRepository);

    const result = await service.resolvePrice({ ...INPUT, vendorId: 'vendor-standard' });

    assert.equal(result.snapshotPayload.listPrice, 100);
    assert.equal(result.snapshotPayload.finalPrice, 100);
    assert.equal(result.snapshotPayload.overrideApplied, false);
    assert.equal(result.snapshotPayload.strategyKey, 'matrix');
  });
});

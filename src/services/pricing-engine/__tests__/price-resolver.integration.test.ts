import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pricingRepository } from '../../../repositories/pricing.repository.js';
import { vendorPriceOverrideRepository } from '../../../repositories/vendor-price-override.repository.js';
import { PriceResolverService } from '../price-resolver.service.js';
import { buildDimensionKeyHash } from '../matrix-pricing.resolver.js';

/**
 * These tests exercise priceResolverService.resolvePrice() directly — the single function all
 * three call sites (rate catalogue, order preview, order placement) invoke. Since they all call
 * the same function with the same inputs, proving resolvePrice() is deterministic here is what
 * "all three call sites return identical numbers" reduces to; a full HTTP-level end-to-end test
 * would require a seeded database this repo does not have test fixtures for.
 */

function decimal(n: number) {
  return { toNumber: () => n } as never;
}

const DEFAULT_BUNDLE = {
  id: 'version-default',
  productPrintConfig: null,
  printProcess: null,
  pricingProfileKey: null,
  ratePerSqFt: null,
  quantityPricing: [{ quantity: 100, basePrice: decimal(500), isActive: true }],
  configurationFields: [],
  pricingRules: [],
  priceMatrixCells: [],
  priceModifierRules: [],
  rollWidthOptions: [],
} as never;

const MATRIX_DIMENSION_KEY = { gsm: '350', sheetSize: '13x19', qtyBand: '1-5' };
const MATRIX_BUNDLE = {
  id: 'version-matrix',
  productPrintConfig: { pricingStrategyKey: 'matrix' },
  printProcess: null,
  pricingProfileKey: null,
  ratePerSqFt: null,
  // Two tiers so quantity 1 buckets into the bounded "1-5" band (matching the cell below),
  // not an open-ended "1+" band.
  quantityPricing: [
    { quantity: 1, basePrice: decimal(0), isActive: true },
    { quantity: 6, basePrice: decimal(0), isActive: true },
  ],
  configurationFields: [],
  pricingRules: [],
  priceMatrixCells: [
    {
      id: 'cell-1',
      dimensionKey: MATRIX_DIMENSION_KEY,
      dimensionKeyHash: buildDimensionKeyHash(MATRIX_DIMENSION_KEY),
      price: decimal(10),
      available: true,
      unavailableReason: null,
    },
  ],
  priceModifierRules: [
    {
      id: 'bs-rule',
      name: 'B/S surcharge',
      triggerField: 'printSide',
      triggerValue: 'BOTH_SIDE',
      amountKey: 'gsm',
      amountTable: { '350': 6 },
      appliesAfter: 'base',
    },
  ],
  rollWidthOptions: [],
} as never;

const FLEX_BUNDLE = {
  id: 'version-flex',
  productPrintConfig: { pricingStrategyKey: 'flex_area' },
  printProcess: null,
  pricingProfileKey: null,
  ratePerSqFt: decimal(10),
  quantityPricing: [],
  configurationFields: [],
  pricingRules: [],
  priceMatrixCells: [],
  priceModifierRules: [],
  rollWidthOptions: [{ id: 'w1', widthFeet: decimal(4), isActive: true }],
} as never;

function stubBundle(t: import('node:test').TestContext, bundle: unknown) {
  t.mock.method(pricingRepository, 'loadVersionBundle', async () => bundle);
}

function stubNoOverrides(t: import('node:test').TestContext) {
  t.mock.method(vendorPriceOverrideRepository, 'loadForVendorAndVersion', async () => []);
}

function stubOverride(
  t: import('node:test').TestContext,
  override: { matrixCellId: string | null; overrideType: 'REPLACE' | 'DELTA'; value: number },
) {
  t.mock.method(vendorPriceOverrideRepository, 'loadForVendorAndVersion', async () => [
    { id: 'ov-1', ...override },
  ]);
}

describe('priceResolverService.resolvePrice — default (quantity-tier) strategy', () => {
  it('prices unchanged products exactly as the existing calculator did', async (t) => {
    stubBundle(t, DEFAULT_BUNDLE);
    stubNoOverrides(t);
    const service = new PriceResolverService();
    const result = await service.resolvePrice({ versionId: 'version-default', quantity: 100, selections: {} });
    assert.equal(result.valid, true);
    assert.equal(result.listPrice, 500);
    assert.equal(result.finalPrice, 500);
    assert.equal(result.overrideApplied, false);
  });

  it('a whole-product vendor override changes the charged price but not the list price', async (t) => {
    stubBundle(t, DEFAULT_BUNDLE);
    stubOverride(t, { matrixCellId: null, overrideType: 'REPLACE', value: 450 });
    const service = new PriceResolverService();
    const result = await service.resolvePrice({
      versionId: 'version-default',
      vendorId: 'vendor-1',
      quantity: 100,
      selections: {},
    });
    assert.equal(result.listPrice, 500);
    assert.equal(result.finalPrice, 450);
    assert.equal(result.overrideApplied, true);
  });
});

describe('priceResolverService.resolvePrice — matrix strategy', () => {
  it('resolves the matrix cell, applies the B/S surcharge, and reports no override', async (t) => {
    stubBundle(t, MATRIX_BUNDLE);
    stubNoOverrides(t);
    const service = new PriceResolverService();
    const result = await service.resolvePrice({
      versionId: 'version-matrix',
      quantity: 3,
      selections: { gsm: '350', sheetSize: '13x19', printSide: 'BOTH_SIDE' },
    });
    assert.equal(result.valid, true);
    // Matrix cells and their surcharges are per-unit rates, so both scale with quantity:
    // (10 base + 6 B/S) x 3.
    assert.equal(result.listPrice, 48);
    assert.equal(result.finalPrice, 48);
    assert.equal(result.unitPrice, 16);
  });

  it('the band rate and its surcharges both scale with quantity', async (t) => {
    stubBundle(t, MATRIX_BUNDLE);
    stubNoOverrides(t);
    const service = new PriceResolverService();
    const selections = { gsm: '350', sheetSize: '13x19', printSide: 'BOTH_SIDE' };

    const one = await service.resolvePrice({ versionId: 'version-matrix', quantity: 1, selections });
    const five = await service.resolvePrice({ versionId: 'version-matrix', quantity: 5, selections });

    // Quantity used to only pick the band and was then discarded, so five sheets billed the same
    // as one. The rate is per sheet, so the line total must scale while the unit rate holds.
    assert.equal(one.listPrice, 16);
    assert.equal(five.listPrice, 80);
    assert.equal(five.unitPrice, one.unitPrice);
  });

  it('an unavailable combination is rejected before any override lookup', async (t) => {
    stubBundle(t, MATRIX_BUNDLE);
    stubNoOverrides(t);
    const service = new PriceResolverService();
    const result = await service.resolvePrice({
      versionId: 'version-matrix',
      quantity: 3,
      selections: { gsm: '120', sheetSize: '13x19' },
    });
    assert.equal(result.valid, false);
  });

  it('a cell-specific vendor override discounts the base before the surcharge stacks', async (t) => {
    stubBundle(t, MATRIX_BUNDLE);
    stubOverride(t, { matrixCellId: 'cell-1', overrideType: 'DELTA', value: -1 });
    const service = new PriceResolverService();
    const result = await service.resolvePrice({
      versionId: 'version-matrix',
      vendorId: 'vendor-1',
      quantity: 3,
      selections: { gsm: '350', sheetSize: '13x19', printSide: 'BOTH_SIDE' },
    });
    // The override discounts the per-unit cell rate, then the whole line scales by quantity.
    assert.equal(result.listPrice, 48); // (10 + 6) x 3
    assert.equal(result.finalPrice, 45); // ((10 - 1) + 6) x 3
    assert.equal(result.unitPrice, 15);
    assert.equal(result.overrideApplied, true);
  });
});

describe('priceResolverService.resolvePrice — flex_area (roll/chargeable-size) strategy', () => {
  it('prices by charged area and flags rounding, with no vendor override', async (t) => {
    stubBundle(t, FLEX_BUNDLE);
    stubNoOverrides(t);
    const service = new PriceResolverService();
    const result = await service.resolvePrice({
      versionId: 'version-flex',
      quantity: 2,
      selections: {},
      uploadedDimensions: { widthFt: 3, heightFt: 3 }, // rounds up to the 4ft roll
    });
    assert.equal(result.valid, true);
    assert.equal(result.chargedWidthFt, 4);
    assert.equal(result.wasRounded, true);
    // unit price = chargedArea (4*3=12) * rate(10) = 120; quantity 2 -> grandTotal 240
    assert.equal(result.unitPrice, 120);
    assert.equal(result.finalPrice, 240);
  });

  it('is rejected pre-override when the design exceeds every available width', async (t) => {
    stubBundle(t, FLEX_BUNDLE);
    stubNoOverrides(t);
    const service = new PriceResolverService();
    const result = await service.resolvePrice({
      versionId: 'version-flex',
      quantity: 1,
      selections: {},
      uploadedDimensions: { widthFt: 6, heightFt: 6 },
    });
    assert.equal(result.valid, false);
  });
});

describe('cross-call-site parity', () => {
  it('identical input always produces identical listPrice/finalPrice, regardless of caller', async (t) => {
    stubBundle(t, MATRIX_BUNDLE);
    stubOverride(t, { matrixCellId: 'cell-1', overrideType: 'REPLACE', value: 9 });
    const service = new PriceResolverService();
    const input = {
      versionId: 'version-matrix',
      vendorId: 'vendor-1',
      quantity: 3,
      selections: { gsm: '350', sheetSize: '13x19', printSide: 'BOTH_SIDE' },
    };

    // Simulates the rate catalogue calling resolvePrice() for a matrix cell...
    const asRateCatalogue = await service.resolvePrice(input);
    // ...and order preview calling it again for the same product+vendor+selection.
    const asOrderPreview = await service.resolvePrice(input);

    assert.deepEqual(asRateCatalogue.listPrice, asOrderPreview.listPrice);
    assert.deepEqual(asRateCatalogue.finalPrice, asOrderPreview.finalPrice);
    assert.equal(asOrderPreview.finalPrice, 45); // (9 overridden base + 6 surcharge) x 3
    assert.equal(asOrderPreview.unitPrice, 15);
  });
});

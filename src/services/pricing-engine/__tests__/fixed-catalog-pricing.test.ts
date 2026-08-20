import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PriceResolverService } from '../price-resolver.service.js';
import { pricingRepository } from '../../../repositories/pricing.repository.js';
import type { VendorPriceOverrideRepository } from '../../../repositories/vendor-price-override.repository.js';

/** Minimal bundle for a catalog product — no matrix, no tiers, just a flat price. */
function catalogBundle(fixedPrice: number | null) {
  return {
    id: 'version-1',
    fixedPrice: fixedPrice === null ? null : new Prisma.Decimal(fixedPrice),
    ratePerSqFt: null,
    pricingProfileKey: null,
    productPrintConfig: null,
    printProcess: null,
    productTypeProfile: {
      key: 'CATALOG_DESIGN_APPROVAL',
      pricingStrategyKey: 'fixed_catalog',
      wizardStepsKey: 'CATALOG_DESIGN_APPROVAL',
      designServiceMode: 'REQUIRED',
    },
    quantityPricing: [],
    configurationFields: [],
    pricingRules: [],
    priceMatrixCells: [],
    priceModifierRules: [],
    rollWidthOptions: [],
  } as never;
}

function overrideRepo(records: unknown[] = []): VendorPriceOverrideRepository {
  return {
    loadForVendorAndVersion: async () => records,
    pickApplicable: (all: unknown[]) => (all[0] ?? null),
  } as unknown as VendorPriceOverrideRepository;
}

describe('fixed_catalog strategy — the price is the price', () => {
  it('returns the admin-set fixedPrice with no computation', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => catalogBundle(2500));
    const service = new PriceResolverService(overrideRepo());

    const result = await service.resolvePrice({
      versionId: 'version-1',
      quantity: 1,
      selections: {},
    });

    assert.equal(result.valid, true);
    assert.equal(result.strategyKey, 'fixed_catalog');
    assert.equal(result.unitPrice, 2500);
    assert.equal(result.finalPrice, 2500);
    assert.equal(result.listPrice, 2500);
    assert.equal(result.overrideApplied, false);
  });

  it('multiplies by quantity without applying any tier discount', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => catalogBundle(2500));
    const service = new PriceResolverService(overrideRepo());

    const result = await service.resolvePrice({
      versionId: 'version-1',
      quantity: 4,
      selections: {},
    });

    assert.equal(result.finalPrice, 10_000, 'flat price x quantity, no tier break');
    assert.equal(result.unitPrice, 2500);
  });

  it('ignores configuration selections rather than stacking option prices', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => catalogBundle(2500));
    const service = new PriceResolverService(overrideRepo());

    const plain = await service.resolvePrice({ versionId: 'version-1', quantity: 1, selections: {} });
    const configured = await service.resolvePrice({
      versionId: 'version-1',
      quantity: 1,
      selections: { lamination: 'gloss', finish: 'foil' },
    });

    assert.equal(configured.finalPrice, plain.finalPrice, 'a catalog card costs what the card costs');
  });

  it('still honours a vendor override — sparse overrides apply to every strategy', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => catalogBundle(2500));
    const service = new PriceResolverService(
      overrideRepo([{ overrideType: 'REPLACE', value: new Prisma.Decimal(1999), matrixCellId: null }]),
    );

    const result = await service.resolvePrice({
      versionId: 'version-1',
      vendorId: 'vendor-1',
      quantity: 1,
      selections: {},
    });

    assert.equal(result.overrideApplied, true);
    assert.equal(result.finalPrice, 1999, 'the negotiated price is charged');
    assert.equal(result.listPrice, 2500, 'the list price is still reported alongside it');
  });

  it('is invalid — not free — when no price has been set', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => catalogBundle(null));
    const service = new PriceResolverService(overrideRepo());

    const result = await service.resolvePrice({ versionId: 'version-1', quantity: 1, selections: {} });

    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /no price set/i);
    assert.equal(result.finalPrice, 0);
  });

  it('rejects a non-positive quantity', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => catalogBundle(2500));
    const service = new PriceResolverService(overrideRepo());

    const result = await service.resolvePrice({ versionId: 'version-1', quantity: 0, selections: {} });

    assert.equal(result.valid, false);
  });

  it('records the strategy in the snapshot so an order can be re-read later', async (t) => {
    t.mock.method(pricingRepository, 'loadVersionBundle', async () => catalogBundle(2500));
    const service = new PriceResolverService(overrideRepo());

    const result = await service.resolvePrice({ versionId: 'version-1', quantity: 2, selections: {} });

    assert.equal(result.snapshotPayload.strategyKey, 'fixed_catalog');
    assert.equal(result.snapshotPayload.fixedPrice, 2500);
    assert.equal(result.snapshotPayload.finalPrice, 5000);
  });
});

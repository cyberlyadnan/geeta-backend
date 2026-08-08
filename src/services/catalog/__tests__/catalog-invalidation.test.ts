import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { CATALOG_MODELS, isCatalogWrite } from '../catalog-invalidation.js';

describe('catalog invalidation', () => {
  it('every watched name is a real Prisma model', () => {
    const real = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name));
    const unknown = [...CATALOG_MODELS].filter((name) => !real.has(name));
    // A typo here is silent: the model simply never matches, so vendor clients are never told
    // the catalogue changed. 'ConfigurationFieldOption' shipped this way.
    assert.deepEqual(unknown, [], `not Prisma models: ${unknown.join(', ')}`);
  });

  it('watches the models that shape what a vendor sees', () => {
    for (const model of [
      'ProductOffering',
      'ConfigurationField',
      'ConfigurationOption',
      'QuantityPricing',
      'PriceMatrixCell',
      'PriceModifierRule',
      'ProductPrintConfig',
    ]) {
      assert.equal(isCatalogWrite(model, 'create'), true, `${model} should bump the catalog`);
    }
  });

  it('ignores reads and non-catalog models', () => {
    assert.equal(isCatalogWrite('ProductOffering', 'findMany'), false);
    assert.equal(isCatalogWrite('Order', 'create'), false);
    assert.equal(isCatalogWrite(undefined, 'create'), false);
  });
});

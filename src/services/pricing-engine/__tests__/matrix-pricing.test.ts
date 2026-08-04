import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDimensionKeyHash,
  buildQuantityBands,
  resolveQuantityBand,
  resolveMatrixPrice,
  applyPriceModifierRules,
  type PriceMatrixCellRecord,
  type PriceModifierRuleRecord,
} from '../matrix-pricing.resolver.js';

function cell(
  dimensionKey: Record<string, string>,
  price: number | null,
  available = true,
  unavailableReason: string | null = null,
): PriceMatrixCellRecord {
  return {
    id: `cell-${JSON.stringify(dimensionKey)}`,
    dimensionKey,
    dimensionKeyHash: buildDimensionKeyHash(dimensionKey),
    price: price == null ? null : ({ toNumber: () => price } as unknown as PriceMatrixCellRecord['price']),
    available,
    unavailableReason,
  };
}

// qty tiers 1 and 6 -> bands "1-5" and "6+", matching the doc's "qty 1-5" example.
const quantityTiers = [
  { quantity: 1, isActive: true },
  { quantity: 6, isActive: true },
];

describe('buildQuantityBands / resolveQuantityBand', () => {
  it('derives inclusive bands from quantity tiers, with an open-ended top band', () => {
    const bands = buildQuantityBands(quantityTiers);
    assert.deepEqual(
      bands.map((b) => b.label),
      ['1-5', '6+'],
    );
  });

  it('resolves an in-range quantity to its band', () => {
    const bands = buildQuantityBands(quantityTiers);
    assert.equal(resolveQuantityBand(bands, 3)?.label, '1-5');
    assert.equal(resolveQuantityBand(bands, 6)?.label, '6+');
    assert.equal(resolveQuantityBand(bands, 5000)?.label, '6+');
  });
});

describe('resolveMatrixPrice — business card matrix', () => {
  const cells: PriceMatrixCellRecord[] = [
    cell({ gsm: '120', sheetSize: '13x19', qtyBand: '1-5' }, 10),
    cell({ gsm: '120', sheetSize: '12x18', qtyBand: '1-5' }, null, false, 'Not available at this GSM'),
  ];

  it('120gsm / 13x19 / qty 1-5 returns ₹10', () => {
    const result = resolveMatrixPrice(cells, quantityTiers, { gsm: '120', sheetSize: '13x19' }, 3);
    assert.equal(result.valid, true);
    assert.equal(result.price, 10);
    assert.equal(result.qtyBand, '1-5');
  });

  it('120gsm / 12x18 is unavailable', () => {
    const result = resolveMatrixPrice(cells, quantityTiers, { gsm: '120', sheetSize: '12x18' }, 3);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'Not available at this GSM');
  });

  it('a combination with no matching cell at all is rejected, not silently priced', () => {
    const result = resolveMatrixPrice(cells, quantityTiers, { gsm: '999', sheetSize: '13x19' }, 3);
    assert.equal(result.valid, false);
  });
});

describe('applyPriceModifierRules — B/S surcharge', () => {
  const bsRule: PriceModifierRuleRecord = {
    id: 'bs-surcharge',
    name: 'B/S surcharge',
    triggerField: 'printSide',
    triggerValue: 'BOTH_SIDE',
    amountKey: 'gsm',
    amountTable: { '120': 5, '170': 5, '250': 5, '300': 5, '350': 6, '400': 6 },
    appliesAfter: 'base',
  };

  it('adds +6 on 350gsm', () => {
    const { total } = applyPriceModifierRules(10, [bsRule], { printSide: 'BOTH_SIDE', gsm: '350' });
    assert.equal(total, 16);
  });

  it('adds +5 on 250gsm — same rule table, different amount', () => {
    const { total } = applyPriceModifierRules(10, [bsRule], { printSide: 'BOTH_SIDE', gsm: '250' });
    assert.equal(total, 15);
  });

  it('does not apply when the trigger field does not match', () => {
    const { total, lines } = applyPriceModifierRules(10, [bsRule], { printSide: 'SINGLE_SIDE', gsm: '350' });
    assert.equal(total, 10);
    assert.equal(lines.length, 0);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validationEngine } from '../engines/validation.engine.js';

describe('ValidationEngine — sheet size & orientation', () => {
  const spec = {
    bleedMm: 3,
    safeAreaMm: 3,
    minDpi: 300,
    allowedFormats: ['PDF', 'PNG', 'JPEG'],
  };

  const resolved13x19 = {
    label: '13×19 inch',
    widthMm: 330,
    heightMm: 483,
    areaCm2: (330 * 483) / 100,
  };

  it('accepts exact 13×19 design size with bleed (336×489 mm)', () => {
    const result = validationEngine.validate(
      {
        fileFormat: 'PNG',
        widthMm: 336,
        heightMm: 489,
        hasTransparency: false,
        rotation: 0,
        fileSizeBytes: 1_000_000,
      },
      spec,
      [],
      resolved13x19,
    );
    const dim = result.checks.find((c) => c.code === 'DIMENSIONS');
    assert.equal(dim?.level, 'SUCCESS');
  });

  it('accepts 19×13 (rotated) against 13×19 sheet', () => {
    const result = validationEngine.validate(
      {
        fileFormat: 'PNG',
        widthMm: 489,
        heightMm: 336,
        hasTransparency: false,
        rotation: 0,
        fileSizeBytes: 1_000_000,
      },
      spec,
      [],
      resolved13x19,
    );
    const dim = result.checks.find((c) => c.code === 'DIMENSIONS');
    assert.equal(dim?.level, 'SUCCESS');
    const orient = result.checks.find((c) => c.code === 'ORIENTATION');
    assert.equal(orient?.level, 'SUCCESS');
  });

  it('flags mismatched dimensions', () => {
    const result = validationEngine.validate(
      {
        fileFormat: 'PNG',
        widthMm: 210,
        heightMm: 297,
        hasTransparency: false,
        rotation: 0,
        fileSizeBytes: 1_000_000,
      },
      spec,
      [],
      resolved13x19,
    );
    const dim = result.checks.find((c) => c.code === 'DIMENSIONS');
    assert.equal(dim?.level, 'WARNING');
  });
});

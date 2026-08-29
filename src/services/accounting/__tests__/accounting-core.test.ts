import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  apportion,
  isStructurallyValidGstin,
  splitTaxAmount,
  stateCodeFromGstin,
} from '../gst-math.js';
import {
  coordinatesFor,
  fiscalYearLabel,
} from '../fiscal-calendar.js';
import { stateCodeFromName, stateNameFromCode } from '../india-states.js';
import { applyPaymentsFifo, bucketIndexForDays } from '../reporting/ageing-math.js';

describe('GSTIN parsing', () => {
  it('reads the state code from the first two digits', () => {
    assert.equal(stateCodeFromGstin('24AAACG1234A1Z5'), '24');
    assert.equal(stateCodeFromGstin('27AAACG1234A1Z5'), '27');
  });

  it('returns null rather than guessing when the value is not a GSTIN', () => {
    assert.equal(stateCodeFromGstin(null), null);
    assert.equal(stateCodeFromGstin(''), null);
    assert.equal(stateCodeFromGstin('AB1234'), null);
  });

  it('checks GSTIN structure', () => {
    assert.equal(isStructurallyValidGstin('24AAACG1234A1Z5'), true);
    assert.equal(isStructurallyValidGstin('24AAACG1234A1X5'), false, 'the 14th character must be Z');
    assert.equal(isStructurallyValidGstin('24AAACG1234A1Z'), false, 'too short');
  });
});

describe('state code lookup', () => {
  it('maps names to codes case-insensitively', () => {
    assert.equal(stateCodeFromName('Gujarat'), '24');
    assert.equal(stateCodeFromName('  maharashtra '), '27');
    assert.equal(stateCodeFromName('Orissa'), '21', 'the older name still resolves');
  });

  it('returns null for an unknown state instead of a wrong one', () => {
    assert.equal(stateCodeFromName('Atlantis'), null);
    assert.equal(stateNameFromCode('99'), null);
  });
});

describe('tax apportionment', () => {
  it('always adds back to the exact total', () => {
    // 100 split three ways is the classic case where naive rounding loses a paisa.
    const parts = apportion(100, [1, 1, 1]);
    assert.equal(parts.reduce((s, p) => s + p, 0), 100);
  });

  it('weights each share by its taxable value', () => {
    const parts = apportion(180, [600, 400]);
    assert.deepEqual(parts, [108, 72]);
  });

  it('puts the remainder on the last line', () => {
    const parts = apportion(10.01, [1, 1]);
    assert.equal(parts.reduce((s, p) => s + p, 0), 10.01);
  });

  it('returns zeros rather than dividing by zero when there is nothing to weight', () => {
    assert.deepEqual(apportion(50, [0, 0]), [0, 0]);
  });
});

describe('fiscal calendar', () => {
  const APRIL = 4;

  it('puts April in period 1 of the year that starts then', () => {
    const coords = coordinatesFor(new Date(2026, 3, 15), APRIL);
    assert.equal(coords.fiscalYear, 2026);
    assert.equal(coords.fiscalPeriod, 1);
  });

  it('puts March in period 12 of the PREVIOUS fiscal year', () => {
    // The single most common off-by-one in Indian accounting software.
    const coords = coordinatesFor(new Date(2027, 2, 31), APRIL);
    assert.equal(coords.fiscalYear, 2026);
    assert.equal(coords.fiscalPeriod, 12);
  });

  it('handles the boundary on either side of 1 April', () => {
    assert.equal(coordinatesFor(new Date(2026, 2, 31), APRIL).fiscalYear, 2025);
    assert.equal(coordinatesFor(new Date(2026, 3, 1), APRIL).fiscalYear, 2026);
  });

  it('labels a fiscal year the way a CA writes it', () => {
    assert.equal(fiscalYearLabel(2026), '2026-27');
    assert.equal(fiscalYearLabel(2099), '2099-00');
  });

  it('supports a January start for a business that does not use the Indian year', () => {
    const coords = coordinatesFor(new Date(2026, 0, 10), 1);
    assert.equal(coords.fiscalYear, 2026);
    assert.equal(coords.fiscalPeriod, 1);
  });
});

describe('receivables ageing (FIFO application)', () => {
  const day = (d: number) => new Date(2026, 0, d);

  it('clears the oldest charge first', () => {
    const open = applyPaymentsFifo([
      { date: day(1), amount: 1000 },
      { date: day(10), amount: 500 },
      { date: day(20), amount: -1000 },
    ]);
    assert.equal(open.length, 1);
    assert.equal(open[0]?.amount, 500);
    assert.equal(open[0]?.date.getTime(), day(10).getTime(), 'the newer charge is the one left open');
  });

  it('partially consumes a charge', () => {
    const open = applyPaymentsFifo([
      { date: day(1), amount: 1000 },
      { date: day(5), amount: -300 },
    ]);
    assert.equal(open.length, 1);
    assert.equal(open[0]?.amount, 700);
  });

  it('leaves nothing open when everything is paid', () => {
    assert.deepEqual(
      applyPaymentsFifo([
        { date: day(1), amount: 400 },
        { date: day(2), amount: 600 },
        { date: day(3), amount: -1000 },
      ]),
      [],
    );
  });

  it('ignores over-payment rather than producing a negative charge', () => {
    const open = applyPaymentsFifo([
      { date: day(1), amount: 100 },
      { date: day(2), amount: -500 },
    ]);
    assert.deepEqual(open, []);
  });

  it('does not leave a sub-paisa residue open', () => {
    const open = applyPaymentsFifo([
      { date: day(1), amount: 100.005 },
      { date: day(2), amount: -100 },
    ]);
    assert.deepEqual(open, [], 'half a paisa is not an outstanding debt');
  });
});

describe('CGST / SGST / IGST split', () => {
  it('halves an even tax amount', () => {
    assert.deepEqual(splitTaxAmount(180, true), { cgst: 90, sgst: 90, igst: 0 });
  });

  it('splits an odd amount without losing a paisa', () => {
    const split = splitTaxAmount(9.01, true);
    assert.equal(split.cgst + split.sgst, 9.01, 'the halves must add back to the whole');
  });

  it('puts the whole amount in IGST for an inter-state supply', () => {
    assert.deepEqual(splitTaxAmount(180, false), { cgst: 0, sgst: 0, igst: 180 });
  });

  it('returns zeros for a nil-rated supply', () => {
    assert.deepEqual(splitTaxAmount(0, true), { cgst: 0, sgst: 0, igst: 0 });
  });
});

describe('ageing buckets', () => {
  it('places a day count in the right bucket', () => {
    assert.equal(bucketIndexForDays(0), 0);
    assert.equal(bucketIndexForDays(30), 0);
    assert.equal(bucketIndexForDays(31), 1);
    assert.equal(bucketIndexForDays(90), 2);
    assert.equal(bucketIndexForDays(180), 3);
    assert.equal(bucketIndexForDays(365), 4, 'anything older falls into the last bucket');
  });
});

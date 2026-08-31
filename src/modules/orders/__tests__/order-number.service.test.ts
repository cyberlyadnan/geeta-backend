import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOrderNumberInput,
  ORDER_NUMBER_PAD_LENGTH,
} from '../order-number.service.js';

describe('normalizeOrderNumberInput', () => {
  it('pads plain digits to six characters', () => {
    assert.equal(normalizeOrderNumberInput('47'), '000047');
    assert.equal(normalizeOrderNumberInput('000047'), '000047');
  });

  it('extracts digits from legacy prefixed order numbers', () => {
    assert.equal(normalizeOrderNumberInput('GP-2026-000047'), '000047');
    assert.equal(normalizeOrderNumberInput('RC-2026-000001'), '000001');
  });

  it('matches allocateOrderNumber pad length', () => {
    assert.equal(ORDER_NUMBER_PAD_LENGTH, 6);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveApplicableSlots,
  resolveRequiredSlotCodes,
  type ConditionalFileSlot,
} from '../required-file-slots.js';

/**
 * A realistic product: one always-required front file, a back file only when printing both sides,
 * and UV layers that follow the UV choice. Note that no field code here appears in the resolver —
 * it is all admin-authored condition data, which is what lets a new attribute bring its own upload
 * slots without a code change.
 */
const SLOTS: ConditionalFileSlot[] = [
  { code: 'front', label: 'Front artwork', requirementType: 'REQUIRED' },
  {
    code: 'back',
    label: 'Back artwork',
    requirementType: 'REQUIRED',
    condition: { field: 'print_side', equals: 'both_side' },
  },
  {
    code: 'uv_front',
    label: 'UV front',
    requirementType: 'REQUIRED',
    condition: { field: 'uv', in: ['front', 'both'] },
  },
  {
    code: 'uv_back',
    label: 'UV back',
    requirementType: 'REQUIRED',
    condition: { field: 'uv', equals: 'both' },
  },
  {
    code: 'reference',
    label: 'Reference file',
    requirementType: 'OPTIONAL',
  },
];

const codes = (selections: Record<string, string>) =>
  resolveApplicableSlots(SLOTS, selections).map((s) => s.code);

describe('conditional artwork slots', () => {
  it('single side with no UV asks only for the front file', () => {
    assert.deepEqual(codes({ print_side: 'single_side', uv: 'none' }), ['front', 'reference']);
  });

  it('both sides adds the back file', () => {
    assert.deepEqual(codes({ print_side: 'both_side', uv: 'none' }), ['front', 'back', 'reference']);
  });

  it('single side with front UV asks for the UV layer but not the back', () => {
    assert.deepEqual(codes({ print_side: 'single_side', uv: 'front' }), [
      'front',
      'uv_front',
      'reference',
    ]);
  });

  it('both sides with UV on both asks for all four', () => {
    assert.deepEqual(codes({ print_side: 'both_side', uv: 'both' }), [
      'front',
      'back',
      'uv_front',
      'uv_back',
      'reference',
    ]);
  });

  it('an unanswered question keeps its conditional slots hidden', () => {
    assert.deepEqual(codes({}), ['front', 'reference']);
  });

  it('only required slots are enforced', () => {
    assert.deepEqual(resolveRequiredSlotCodes(SLOTS, { print_side: 'both_side' }), [
      'front',
      'back',
    ]);
  });

  it('a slot with no condition is always asked for', () => {
    const always: ConditionalFileSlot[] = [
      { code: 'main', label: 'Main', requirementType: 'REQUIRED' },
    ];
    assert.deepEqual(resolveRequiredSlotCodes(always, {}), ['main']);
    assert.deepEqual(resolveRequiredSlotCodes(always, { anything: 'x' }), ['main']);
  });
});

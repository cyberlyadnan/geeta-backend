import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveApplicableSlots,
  resolveFileSlots,
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

/**
 * The print-shop convention: both-sides artwork arrives as one file with two pages, not two
 * files. Pages are declared per slot and each may be conditional, so the same upload box asks
 * for one page or two depending on what the vendor picked — and toggling between them does not
 * discard an already-uploaded file, which a second slot would.
 */
describe('conditional pages within a slot', () => {
  const designSlot: ConditionalFileSlot = {
    code: 'design',
    label: 'Design',
    requirementType: 'REQUIRED',
    pages: [
      { label: 'Front Design File' },
      { label: 'Back Design File', condition: { field: 'print_side', equals: 'both_side' } },
    ],
  };

  it('single side asks for a one-page file', () => {
    const [slot] = resolveFileSlots([designSlot], { print_side: 'single_side' });
    assert.equal(slot?.requiredPages, 1);
    assert.deepEqual(slot?.pageLabels, ['Front Design File']);
  });

  it('both sides asks for one file with two named pages, in order', () => {
    const [slot] = resolveFileSlots([designSlot], { print_side: 'both_side' });
    assert.equal(slot?.requiredPages, 2);
    assert.deepEqual(slot?.pageLabels, ['Front Design File', 'Back Design File']);
  });

  it('a slot declaring no pages is an ordinary single-file upload', () => {
    const plain: ConditionalFileSlot = { code: 'ref', label: 'Reference', requirementType: 'OPTIONAL' };
    const [slot] = resolveFileSlots([plain], {});
    assert.equal(slot?.requiredPages, 1);
    assert.deepEqual(slot?.pageLabels, []);
  });

  it('malformed page data degrades to a single page rather than throwing', () => {
    const broken = { ...designSlot, pages: 'not-an-array' } as ConditionalFileSlot;
    const [slot] = resolveFileSlots([broken], { print_side: 'both_side' });
    assert.equal(slot?.requiredPages, 1);
  });

  it('slot conditions and page conditions compose', () => {
    const uv: ConditionalFileSlot = {
      code: 'uv',
      label: 'UV layer',
      requirementType: 'REQUIRED',
      groupLabel: 'UV',
      condition: { field: 'uv', in: ['front', 'both'] },
      pages: [
        { label: 'UV Front' },
        { label: 'UV Back', condition: { field: 'uv', equals: 'both' } },
      ],
    };
    assert.deepEqual(resolveFileSlots([uv], { uv: 'none' }), []);
    assert.equal(resolveFileSlots([uv], { uv: 'front' })[0]?.requiredPages, 1);
    assert.equal(resolveFileSlots([uv], { uv: 'both' })[0]?.requiredPages, 2);
  });
});

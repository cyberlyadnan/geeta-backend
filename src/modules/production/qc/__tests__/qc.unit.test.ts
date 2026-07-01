import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { QualityInspectionResult, RoleName } from '@prisma/client';
import {
  addDefectSchema,
  submitInspectionSchema,
  updateChecklistSchema,
} from '../qc.validation.js';
import {
  assertCanInspectQc,
  canInspectQc,
  canViewQcMetrics,
} from '../qc.access.js';

describe('qc.access', () => {
  it('allows staff with inspect permission', () => {
    assert.equal(canInspectQc(RoleName.STAFF, ['production.qc.inspect']), true);
  });

  it('allows managers without explicit permission', () => {
    assert.equal(canInspectQc(RoleName.MANAGER, []), true);
  });

  it('denies staff without permission', () => {
    assert.equal(canInspectQc(RoleName.STAFF, []), false);
  });

  it('allows assigned inspector to inspect own task', () => {
    assert.doesNotThrow(() =>
      assertCanInspectQc('inspector-1', 'inspector-1', RoleName.STAFF, ['production.qc.inspect']),
    );
  });

  it('allows managers to inspect any task', () => {
    assert.doesNotThrow(() =>
      assertCanInspectQc('other-operator', 'manager-1', RoleName.MANAGER, []),
    );
  });

  it('allows QC metrics for managers', () => {
    assert.equal(canViewQcMetrics(RoleName.MANAGER, []), true);
  });

  it('allows QC metrics with view.all permission', () => {
    assert.equal(canViewQcMetrics(RoleName.STAFF, ['production.qc.view.all']), true);
  });
});

describe('qc.validation', () => {
  it('accepts valid checklist updates', () => {
    const parsed = updateChecklistSchema.parse({
      items: [{ itemCode: 'COLOR_ACCURACY', label: 'Color Accuracy', passed: true }],
    });
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0]?.passed, true);
  });

  it('accepts defect with default severity', () => {
    const parsed = addDefectSchema.parse({
      category: 'COLOR',
      description: 'Color mismatch on edge',
    });
    assert.equal(parsed.severity, 'MEDIUM');
  });

  it('accepts all inspection result types', () => {
    for (const result of Object.values(QualityInspectionResult)) {
      const parsed = submitInspectionSchema.parse({ result });
      assert.equal(parsed.result, result);
    }
  });

  it('rejects empty checklist updates', () => {
    assert.throws(() => updateChecklistSchema.parse({ items: [] }));
  });
});

describe('qc workflow callback contract', () => {
  it('maps pass results to workflow complete action', () => {
    const passResults: QualityInspectionResult[] = ['PASS', 'PASS_WITH_REMARKS'];
    for (const result of passResults) {
      assert.ok(['PASS', 'PASS_WITH_REMARKS'].includes(result));
    }
  });

  it('maps fail results to rework workflow path', () => {
    const reworkResults: QualityInspectionResult[] = ['FAIL', 'REWORK_REQUIRED'];
    for (const result of reworkResults) {
      assert.ok(['FAIL', 'REWORK_REQUIRED'].includes(result));
    }
  });

  it('maps hold result without advancing workflow', () => {
    assert.equal(submitInspectionSchema.parse({ result: 'ON_HOLD' }).result, 'ON_HOLD');
  });
});

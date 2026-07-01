import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { RoleName } from '@prisma/client';
import { canViewControlCenter, assertCanViewControlCenter } from '../control-center.access.js';
import { computeHeatmapLevel, percent, averageSeconds } from '../control-center.utils.js';

describe('control-center.access', () => {
  it('allows managers without explicit permission', () => {
    assert.equal(canViewControlCenter(RoleName.MANAGER, []), true);
  });

  it('allows users with production.control.view', () => {
    assert.equal(canViewControlCenter(RoleName.STAFF, ['production.control.view']), true);
  });

  it('denies staff without permission', () => {
    assert.equal(canViewControlCenter(RoleName.STAFF, []), false);
  });

  it('throws for unauthorized staff', () => {
    assert.throws(() => assertCanViewControlCenter(RoleName.STAFF, []));
  });
});

describe('control-center.utils', () => {
  it('computes heatmap levels from workload and delays', () => {
    assert.equal(computeHeatmapLevel(5, 0), 'GREEN');
    assert.equal(computeHeatmapLevel(15, 1), 'YELLOW');
    assert.equal(computeHeatmapLevel(30, 0), 'RED');
    assert.equal(computeHeatmapLevel(10, 5), 'RED');
  });

  it('computes percent safely', () => {
    assert.equal(percent(25, 100), 25);
    assert.equal(percent(0, 0), 0);
  });

  it('averages seconds', () => {
    assert.equal(averageSeconds([100, 200, 300]), 200);
    assert.equal(averageSeconds([]), 0);
  });
});

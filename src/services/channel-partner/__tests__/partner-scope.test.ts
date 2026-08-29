import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertVendorInScope, isVendorInScope } from '../partner-scope.js';

describe('channel partner scoping', () => {
  it('allows a vendor on the partner’s active list', () => {
    assert.equal(isVendorInScope(['vendor-a', 'vendor-b'], 'vendor-b'), true);
    assert.doesNotThrow(() => {
      assertVendorInScope(['vendor-a', 'vendor-b'], 'vendor-b');
    });
  });

  it('refuses a vendor belonging to another partner', () => {
    assert.equal(isVendorInScope(['vendor-a'], 'vendor-z'), false);
    assert.throws(() => {
      assertVendorInScope(['vendor-a'], 'vendor-z');
    });
  });

  it('refuses everything when the list is empty — a suspended partner sees nothing', () => {
    assert.equal(isVendorInScope([], 'vendor-a'), false);
    assert.throws(() => {
      assertVendorInScope([], 'vendor-a');
    });
  });

  it('answers 404, not 403, so vendor ids cannot be probed', () => {
    try {
      assertVendorInScope(['vendor-a'], 'vendor-z');
      assert.fail('expected a rejection');
    } catch (error) {
      assert.equal((error as { statusCode?: number }).statusCode, 404);
    }
  });

  it('does not treat a partial id match as a match', () => {
    assert.equal(isVendorInScope(['vendor-abc'], 'vendor-ab'), false);
  });

  it('refuses the partner’s own id unless it was explicitly linked', () => {
    assert.equal(isVendorInScope(['vendor-a'], 'partner-user-1'), false);
  });
});

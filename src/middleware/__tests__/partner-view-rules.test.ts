import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decidePartnerView } from '../partner-view-rules.js';

const decide = (method: string, url: string, hasHeader = true) =>
  decidePartnerView({ hasHeader, method, url });

describe('partner "view as vendor" gate', () => {
  it('does nothing at all without the header', () => {
    assert.equal(decide('GET', '/api/v1/orders', false).kind, 'ignore');
    assert.equal(decide('POST', '/api/v1/orders', false).kind, 'ignore');
  });

  it('lets a plain read through to the link check', () => {
    assert.equal(decide('GET', '/api/v1/orders').kind, 'verify');
    assert.equal(decide('GET', '/api/v1/orders?page=2&status=DISPATCHED').kind, 'verify');
    assert.equal(decide('HEAD', '/api/v1/wallet/summary').kind, 'verify');
  });

  it('refuses every write, whatever the path', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const decision = decide(method, '/api/v1/orders');
      assert.deepEqual(decision, { kind: 'refuse', reason: 'method' }, `${method} must be refused`);
    }
  });

  it('is not fooled by a lower-case method', () => {
    assert.deepEqual(decide('post', '/api/v1/orders'), { kind: 'refuse', reason: 'method' });
  });

  it('refuses auth paths even on a GET — tokens are never issued for someone else', () => {
    assert.deepEqual(decide('GET', '/api/v1/auth/me'), { kind: 'refuse', reason: 'path' });
    assert.deepEqual(decide('GET', '/api/v1/auth'), { kind: 'refuse', reason: 'path' });
  });

  it('refuses storage paths — a signed upload URL is a write wearing a GET', () => {
    assert.deepEqual(decide('GET', '/api/v1/storage/presign'), { kind: 'refuse', reason: 'path' });
  });

  it('ignores the header on the partner’s own endpoints, so the way back never disappears', () => {
    assert.equal(decide('GET', '/api/v1/partner/me').kind, 'ignore');
    assert.equal(decide('GET', '/api/v1/partner/vendors').kind, 'ignore');
    // Self-only wins over the method check, so a partner's own write is never mis-refused.
    assert.equal(decide('POST', '/api/v1/partner/anything').kind, 'ignore');
  });

  it('matches prefixes on a path boundary, not a substring', () => {
    // A route that merely starts with the same letters must not inherit the exemption.
    assert.equal(decide('GET', '/api/v1/partners-report').kind, 'verify');
    assert.equal(decide('GET', '/api/v1/authors').kind, 'verify');
    assert.equal(decide('GET', '/api/v1/storages-report').kind, 'verify');
  });

  it('treats a query string on an exempt path as still exempt', () => {
    assert.equal(decide('GET', '/api/v1/partner?from=2026-04-01').kind, 'ignore');
    assert.deepEqual(decide('GET', '/api/v1/auth?next=x'), { kind: 'refuse', reason: 'path' });
  });
});

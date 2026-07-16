import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CancellationStageKey, ProductionOrderStatus } from '@prisma/client';
import {
  resolveCancellationPolicy,
  resolveStageFromOrderStatus,
} from '../cancellation-policy.engine.js';

const defaultRules = [
  {
    id: '1',
    stageKey: CancellationStageKey.VERIFICATION,
    label: 'Artwork Verification',
    vendorDirectCancel: true,
    vendorRequestAllowed: false,
    managerApprovalRequired: false,
    cancellationAllowed: true,
    policyExplanation: 'Vendor can cancel during verification.',
    sortOrder: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '2',
    stageKey: CancellationStageKey.PRODUCTION,
    label: 'Production',
    vendorDirectCancel: false,
    vendorRequestAllowed: true,
    managerApprovalRequired: true,
    cancellationAllowed: true,
    policyExplanation: 'Request cancellation during production.',
    sortOrder: 30,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '3',
    stageKey: CancellationStageKey.COMPLETED,
    label: 'Completed',
    vendorDirectCancel: false,
    vendorRequestAllowed: false,
    managerApprovalRequired: false,
    cancellationAllowed: false,
    policyExplanation: 'Not allowed.',
    sortOrder: 50,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('cancellation policy engine', () => {
  it('maps verification statuses to VERIFICATION stage', () => {
    assert.equal(
      resolveStageFromOrderStatus(ProductionOrderStatus.UNDER_ARTWORK_REVIEW),
      CancellationStageKey.VERIFICATION,
    );
  });

  it('allows direct cancel during verification', () => {
    const decision = resolveCancellationPolicy(
      ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
      defaultRules,
    );
    assert.equal(decision?.allowedAction, 'DIRECT_CANCEL');
    assert.equal(decision?.vendorDirectCancelAllowed, true);
  });

  it('requires cancellation request during production', () => {
    const decision = resolveCancellationPolicy(
      ProductionOrderStatus.IN_PRODUCTION,
      defaultRules,
    );
    assert.equal(decision?.allowedAction, 'REQUEST_CANCELLATION');
    assert.equal(decision?.managerApprovalRequired, true);
  });

  it('blocks actions when pending request exists', () => {
    const decision = resolveCancellationPolicy(
      ProductionOrderStatus.CANCELLATION_REQUESTED,
      defaultRules,
      { hasPendingRequest: true },
    );
    assert.equal(decision?.allowedAction, 'NONE');
  });

  it('disallows completed orders', () => {
    const decision = resolveCancellationPolicy(
      ProductionOrderStatus.COMPLETED,
      defaultRules,
    );
    assert.equal(decision?.allowedAction, 'NOT_ALLOWED');
  });
});

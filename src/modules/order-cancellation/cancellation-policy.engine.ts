import {
  CancellationStageKey,
  ProductionOrderStatus,
  type CancellationPolicyRule,
} from '@prisma/client';
import {
  CANCELLATION_ALLOWED_ACTION,
  type CancellationAllowedAction,
} from './cancellation.constants.js';

export interface CancellationPolicyDecision {
  stageKey: CancellationStageKey;
  stageLabel: string;
  vendorDirectCancelAllowed: boolean;
  vendorRequestAllowed: boolean;
  managerApprovalRequired: boolean;
  cancellationAllowed: boolean;
  allowedAction: CancellationAllowedAction;
  policyExplanation: string;
}

const STAGE_FROM_STATUS: Partial<Record<ProductionOrderStatus, CancellationStageKey>> = {
  DRAFT: CancellationStageKey.VERIFICATION,
  ORDER_PLACED: CancellationStageKey.VERIFICATION,
  PENDING_PAYMENT: CancellationStageKey.VERIFICATION,
  UNDER_ARTWORK_REVIEW: CancellationStageKey.VERIFICATION,
  ARTWORK_APPROVED: CancellationStageKey.ARTWORK_APPROVED,
  CONFIRMED: CancellationStageKey.ARTWORK_APPROVED,
  IN_PRODUCTION: CancellationStageKey.PRODUCTION,
  QUALITY_CHECK: CancellationStageKey.PRODUCTION,
  ON_HOLD: CancellationStageKey.PRODUCTION,
  READY_FOR_DISPATCH: CancellationStageKey.PRODUCTION,
  DISPATCHED: CancellationStageKey.DISPATCH,
  DELIVERED: CancellationStageKey.COMPLETED,
  COMPLETED: CancellationStageKey.COMPLETED,
};

export function resolveStageFromOrderStatus(
  status: ProductionOrderStatus,
): CancellationStageKey | null {
  if (status === ProductionOrderStatus.CANCELLED) return null;
  if (status === ProductionOrderStatus.CANCELLATION_REQUESTED) return null;
  return STAGE_FROM_STATUS[status] ?? CancellationStageKey.PRODUCTION;
}

export function resolveCancellationPolicy(
  orderStatus: ProductionOrderStatus,
  rules: CancellationPolicyRule[],
  options: { hasPendingRequest?: boolean } = {},
): CancellationPolicyDecision | null {
  if (orderStatus === ProductionOrderStatus.CANCELLED) {
    return null;
  }

  if (
    orderStatus === ProductionOrderStatus.CANCELLATION_REQUESTED ||
    options.hasPendingRequest
  ) {
    return {
      stageKey: CancellationStageKey.PRODUCTION,
      stageLabel: 'Cancellation pending',
      vendorDirectCancelAllowed: false,
      vendorRequestAllowed: false,
      managerApprovalRequired: true,
      cancellationAllowed: false,
      allowedAction: CANCELLATION_ALLOWED_ACTION.NONE,
      policyExplanation:
        'A cancellation request is already pending production manager review.',
    };
  }

  const stageKey = resolveStageFromOrderStatus(orderStatus);
  if (!stageKey) return null;

  const rule =
    rules.find((r) => r.stageKey === stageKey && r.isActive) ??
    rules.find((r) => r.stageKey === stageKey);

  if (!rule) {
    return {
      stageKey,
      stageLabel: stageKey,
      vendorDirectCancelAllowed: false,
      vendorRequestAllowed: false,
      managerApprovalRequired: true,
      cancellationAllowed: false,
      allowedAction: CANCELLATION_ALLOWED_ACTION.NOT_ALLOWED,
      policyExplanation: 'No cancellation policy configured for this stage.',
    };
  }

  let allowedAction: CancellationAllowedAction = CANCELLATION_ALLOWED_ACTION.NOT_ALLOWED;

  if (!rule.cancellationAllowed) {
    allowedAction = CANCELLATION_ALLOWED_ACTION.NOT_ALLOWED;
  } else if (rule.vendorDirectCancel) {
    allowedAction = CANCELLATION_ALLOWED_ACTION.DIRECT_CANCEL;
  } else if (rule.vendorRequestAllowed) {
    allowedAction = CANCELLATION_ALLOWED_ACTION.REQUEST_CANCELLATION;
  }

  return {
    stageKey: rule.stageKey,
    stageLabel: rule.label,
    vendorDirectCancelAllowed: rule.vendorDirectCancel,
    vendorRequestAllowed: rule.vendorRequestAllowed,
    managerApprovalRequired: rule.managerApprovalRequired,
    cancellationAllowed: rule.cancellationAllowed,
    allowedAction,
    policyExplanation:
      rule.policyExplanation ??
      `${rule.label}: cancellation policy applies at this production stage.`,
  };
}

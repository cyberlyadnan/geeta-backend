// ── Order-time delivery resolution and totals (pre-existing) ──────────────────────────────────
export * from './delivery.types.js';
export { resolveDeliveryForOrder, calculateOrderTotals } from './delivery.engine.js';
export {
  getVendorProfileForDelivery,
  formatVendorAddress,
  deliverySettingsRepository,
} from './delivery.repository.js';

// ── Phase 7: the delivery department ──────────────────────────────────────────────────────────
export { deliveryRoutingService, DeliveryRoutingService } from './delivery-routing.service.js';
export {
  deliveryAssignmentService,
  DeliveryAssignmentService,
  ASSIGNMENT_DETAIL_INCLUDE,
} from './delivery-assignment.service.js';
export {
  isServiceInScope,
  assertServiceInScope,
  canAgentAct,
  assertAgentCanAct,
  canTransition,
  assertTransition,
  OPEN_ASSIGNMENT_STATUSES,
  CLOSED_ASSIGNMENT_STATUSES,
} from './delivery-scope.js';

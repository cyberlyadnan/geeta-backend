import { DeliveryAssignmentStatus } from '@prisma/client';
import { ApiError } from '../../common/errors/ApiError.js';

/**
 * What a delivery person is allowed to see, as a pure rule.
 *
 * The whole of a delivery agent's authorisation is the list of services they are tagged with. A
 * consignment is theirs to see because its service is on that list, and for no other reason —
 * not because of a role, a department, or who happened to create it. Keeping that decision here,
 * with no database and no request, means it can be tested exhaustively and there is exactly one
 * place in the codebase where it is expressed.
 */

/** Statuses a consignment can be in while it is still somebody's job. */
export const OPEN_ASSIGNMENT_STATUSES: DeliveryAssignmentStatus[] = [
  DeliveryAssignmentStatus.UNASSIGNED,
  DeliveryAssignmentStatus.ASSIGNED,
  DeliveryAssignmentStatus.PICKED_UP,
  DeliveryAssignmentStatus.IN_TRANSIT,
  DeliveryAssignmentStatus.FAILED,
];

/** Statuses that mean the consignment has left the queue for good. */
export const CLOSED_ASSIGNMENT_STATUSES: DeliveryAssignmentStatus[] = [
  DeliveryAssignmentStatus.DELIVERED,
  DeliveryAssignmentStatus.RETURNED,
  DeliveryAssignmentStatus.CANCELLED,
];

export function isServiceInScope(
  taggedServiceIds: readonly string[],
  deliveryServiceId: string,
): boolean {
  return taggedServiceIds.includes(deliveryServiceId);
}

/**
 * Refuses an out-of-scope consignment as "not found" rather than "forbidden".
 *
 * A 403 confirms the consignment exists; an agent could walk ids and learn which vendors the
 * business ships for. A 404 tells them nothing they did not already know.
 */
export function assertServiceInScope(
  taggedServiceIds: readonly string[],
  deliveryServiceId: string,
): void {
  if (!isServiceInScope(taggedServiceIds, deliveryServiceId)) {
    throw ApiError.notFound('Consignment not found');
  }
}

/**
 * Whether this particular agent may act on this consignment — not merely see it.
 *
 * Seeing is a service question; acting is an ownership one. An unclaimed consignment on one of my
 * services is mine to take; one already in somebody else's hands is not mine to mark delivered,
 * because two people recording a handover for the same goods is how a dispute becomes unwinnable.
 */
export function canAgentAct(input: {
  taggedServiceIds: readonly string[];
  deliveryServiceId: string;
  assignedToId: string | null;
  agentUserId: string;
}): boolean {
  if (!isServiceInScope(input.taggedServiceIds, input.deliveryServiceId)) return false;
  return input.assignedToId === null || input.assignedToId === input.agentUserId;
}

export function assertAgentCanAct(input: {
  taggedServiceIds: readonly string[];
  deliveryServiceId: string;
  assignedToId: string | null;
  agentUserId: string;
}): void {
  assertServiceInScope(input.taggedServiceIds, input.deliveryServiceId);
  if (input.assignedToId !== null && input.assignedToId !== input.agentUserId) {
    throw ApiError.forbidden('This consignment is already with another delivery person.');
  }
}

/** Legal next steps, so an out-of-order tap on a phone cannot rewrite history. */
const ALLOWED_TRANSITIONS: Record<DeliveryAssignmentStatus, DeliveryAssignmentStatus[]> = {
  [DeliveryAssignmentStatus.UNASSIGNED]: [
    DeliveryAssignmentStatus.ASSIGNED,
    DeliveryAssignmentStatus.CANCELLED,
  ],
  [DeliveryAssignmentStatus.ASSIGNED]: [
    DeliveryAssignmentStatus.PICKED_UP,
    // Handing it back to the queue is a normal thing to do, not a failure.
    DeliveryAssignmentStatus.UNASSIGNED,
    DeliveryAssignmentStatus.CANCELLED,
  ],
  [DeliveryAssignmentStatus.PICKED_UP]: [
    DeliveryAssignmentStatus.IN_TRANSIT,
    DeliveryAssignmentStatus.DELIVERED,
    DeliveryAssignmentStatus.FAILED,
    DeliveryAssignmentStatus.RETURNED,
  ],
  [DeliveryAssignmentStatus.IN_TRANSIT]: [
    DeliveryAssignmentStatus.DELIVERED,
    DeliveryAssignmentStatus.FAILED,
    DeliveryAssignmentStatus.RETURNED,
  ],
  // A failed attempt goes back on the road; it is not the end of the consignment.
  [DeliveryAssignmentStatus.FAILED]: [
    DeliveryAssignmentStatus.ASSIGNED,
    DeliveryAssignmentStatus.UNASSIGNED,
    DeliveryAssignmentStatus.IN_TRANSIT,
    DeliveryAssignmentStatus.DELIVERED,
    DeliveryAssignmentStatus.RETURNED,
    DeliveryAssignmentStatus.CANCELLED,
  ],
  [DeliveryAssignmentStatus.DELIVERED]: [],
  [DeliveryAssignmentStatus.RETURNED]: [],
  [DeliveryAssignmentStatus.CANCELLED]: [],
};

export function canTransition(
  from: DeliveryAssignmentStatus,
  to: DeliveryAssignmentStatus,
): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(
  from: DeliveryAssignmentStatus,
  to: DeliveryAssignmentStatus,
): void {
  if (!canTransition(from, to)) {
    throw ApiError.badRequest(
      `A consignment that is ${from.toLowerCase().replace(/_/g, ' ')} cannot become ${to
        .toLowerCase()
        .replace(/_/g, ' ')}.`,
    );
  }
}

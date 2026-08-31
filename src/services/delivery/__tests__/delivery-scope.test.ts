import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DeliveryAssignmentStatus } from '@prisma/client';
import {
  canAgentAct,
  canTransition,
  isServiceInScope,
  assertServiceInScope,
  assertTransition,
  CLOSED_ASSIGNMENT_STATUSES,
  OPEN_ASSIGNMENT_STATUSES,
} from '../delivery-scope.js';

const BUS = 'svc-bus';
const LOCAL = 'svc-local';
const COURIER = 'svc-courier';

describe('delivery visibility', () => {
  it('shows a consignment to an agent tagged with its service', () => {
    assert.equal(isServiceInScope([BUS, LOCAL], BUS), true);
  });

  it('hides one on a service the agent does not hold', () => {
    assert.equal(isServiceInScope([LOCAL], BUS), false);
    assert.throws(() => {
      assertServiceInScope([LOCAL], BUS);
    });
  });

  it('shows nothing to an agent with no tags at all', () => {
    assert.equal(isServiceInScope([], BUS), false);
  });

  it('answers 404, not 403, so consignment ids cannot be probed', () => {
    try {
      assertServiceInScope([LOCAL], COURIER);
      assert.fail('expected a rejection');
    } catch (error) {
      assert.equal((error as { statusCode?: number }).statusCode, 404);
    }
  });
});

describe('who may act on a consignment', () => {
  const base = { taggedServiceIds: [BUS], deliveryServiceId: BUS, agentUserId: 'agent-1' };

  it('lets a tagged agent take an unclaimed consignment', () => {
    assert.equal(canAgentAct({ ...base, assignedToId: null }), true);
  });

  it('lets an agent act on their own consignment', () => {
    assert.equal(canAgentAct({ ...base, assignedToId: 'agent-1' }), true);
  });

  it('refuses acting on a consignment somebody else is carrying', () => {
    assert.equal(canAgentAct({ ...base, assignedToId: 'agent-2' }), false);
  });

  it('refuses even an unclaimed consignment on a service the agent lacks', () => {
    assert.equal(
      canAgentAct({ ...base, taggedServiceIds: [LOCAL], assignedToId: null }),
      false,
    );
  });
});

describe('consignment state machine', () => {
  const S = DeliveryAssignmentStatus;

  it('walks the ordinary round: queued, taken, collected, on the road, delivered', () => {
    assert.equal(canTransition(S.UNASSIGNED, S.ASSIGNED), true);
    assert.equal(canTransition(S.ASSIGNED, S.PICKED_UP), true);
    assert.equal(canTransition(S.PICKED_UP, S.IN_TRANSIT), true);
    assert.equal(canTransition(S.IN_TRANSIT, S.DELIVERED), true);
  });

  it('allows delivering straight from pickup, for a short local run', () => {
    assert.equal(canTransition(S.PICKED_UP, S.DELIVERED), true);
  });

  it('refuses delivering something nobody has collected', () => {
    assert.equal(canTransition(S.UNASSIGNED, S.DELIVERED), false);
    assert.equal(canTransition(S.ASSIGNED, S.DELIVERED), false);
    assert.throws(() => {
      assertTransition(S.ASSIGNED, S.DELIVERED);
    });
  });

  it('lets a failed attempt go back on the road or be delivered next time', () => {
    assert.equal(canTransition(S.FAILED, S.IN_TRANSIT), true);
    assert.equal(canTransition(S.FAILED, S.DELIVERED), true);
    assert.equal(canTransition(S.FAILED, S.RETURNED), true);
  });

  it('lets an agent hand an untouched consignment back to the queue', () => {
    assert.equal(canTransition(S.ASSIGNED, S.UNASSIGNED), true);
  });

  it('refuses handing back goods already in the van', () => {
    // The consignment is physically with the agent; releasing it would lose track of the goods.
    assert.equal(canTransition(S.PICKED_UP, S.UNASSIGNED), false);
    assert.equal(canTransition(S.IN_TRANSIT, S.UNASSIGNED), false);
  });

  it('treats delivered, returned and cancelled as final', () => {
    for (const terminal of [S.DELIVERED, S.RETURNED, S.CANCELLED]) {
      for (const target of Object.values(S)) {
        assert.equal(
          canTransition(terminal, target),
          false,
          `${terminal} must not become ${target}`,
        );
      }
    }
  });

  it('refuses cancelling a consignment already on the road', () => {
    // Cancelling goods in a van would leave the orders looking cancelled while they still arrive.
    assert.equal(canTransition(S.PICKED_UP, S.CANCELLED), false);
    assert.equal(canTransition(S.IN_TRANSIT, S.CANCELLED), false);
    assert.equal(canTransition(S.UNASSIGNED, S.CANCELLED), true);
  });

  it('sorts every status into exactly one of open or closed', () => {
    const all = Object.values(S);
    for (const status of all) {
      const open = OPEN_ASSIGNMENT_STATUSES.includes(status);
      const closed = CLOSED_ASSIGNMENT_STATUSES.includes(status);
      assert.equal(open !== closed, true, `${status} must be exactly one of open or closed`);
    }
  });
});

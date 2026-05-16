import { SOCKET_EVENTS, SOCKET_ROOMS } from '../../constants/socketEvents.js';
import { getIO } from '../socket.server.js';

export function emitWorkflowStepUpdated(
  workflowId: string,
  payload: { stepId: string; status: string },
): void {
  getIO().to(SOCKET_ROOMS.workflow(workflowId)).emit(SOCKET_EVENTS.WORKFLOW_STEP_UPDATED, {
    workflowId,
    ...payload,
  });
}

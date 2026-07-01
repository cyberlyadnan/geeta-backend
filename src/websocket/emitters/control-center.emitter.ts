import { SOCKET_EVENTS, SOCKET_ROOMS } from '../../constants/socketEvents.js';
import { getIO } from '../socket.server.js';

export function emitControlCenterUpdated(payload: { refreshedAt: string; source?: string }): void {
  try {
    getIO()
      .to(SOCKET_ROOMS.productionControl)
      .emit(SOCKET_EVENTS.CONTROL_CENTER_UPDATED, payload);
  } catch {
    // Socket may be unavailable in tests or worker-only processes.
  }
}

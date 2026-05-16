import { SOCKET_EVENTS } from '../../constants/socketEvents.js';
import { emitToUser } from '../handlers/index.js';

export function emitNotification(
  userId: string,
  notification: { id: string; title: string; body: string; type: string },
): void {
  emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_NEW, notification);
}

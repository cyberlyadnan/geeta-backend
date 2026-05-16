import { SOCKET_EVENTS } from '../../constants/socketEvents.js';
import { emitToOrder, emitToUser } from '../handlers/index.js';

export function emitOrderStatusChanged(
  orderId: string,
  userId: string,
  payload: { status: string; updatedAt: string },
): void {
  emitToOrder(orderId, SOCKET_EVENTS.ORDER_STATUS_CHANGED, { orderId, ...payload });
  emitToUser(userId, SOCKET_EVENTS.ORDER_UPDATED, { orderId, ...payload });
}

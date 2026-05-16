import type { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS, SOCKET_ROOMS } from '../../constants/socketEvents.js';
import { logger } from '../../logs/logger.js';
import { getIO } from '../socket.server.js';

export function registerSocketHandlers(socket: Socket, _io: Server): void {
  socket.on(SOCKET_EVENTS.JOIN_ROOM, (room: string) => {
    void socket.join(room);
    logger.debug('Socket joined room', { socketId: socket.id, room });
  });

  socket.on(SOCKET_EVENTS.LEAVE_ROOM, (room: string) => {
    void socket.leave(room);
    logger.debug('Socket left room', { socketId: socket.id, room });
  });

  socket.on(SOCKET_EVENTS.DISCONNECT, () => {
    logger.debug('Socket disconnected', { socketId: socket.id });
  });
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  getIO().to(SOCKET_ROOMS.user(userId)).emit(event, data);
}

export function emitToOrder(orderId: string, event: string, data: unknown): void {
  getIO().to(SOCKET_ROOMS.order(orderId)).emit(event, data);
}

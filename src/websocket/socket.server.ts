import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { socketConfig } from '../config/socket.js';
import { logger } from '../logs/logger.js';
import { registerSocketHandlers } from './handlers/index.js';

let io: Server | null = null;

export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, socketConfig);

  io.on('connection', (socket) => {
    logger.debug('Socket connected', { socketId: socket.id });
    registerSocketHandlers(socket, io!);
  });

  logger.info('Socket.io initialized');
  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

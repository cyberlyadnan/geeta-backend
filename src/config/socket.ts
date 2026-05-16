import { env } from './env.js';

export const socketConfig = {
  cors: {
    origin: env.SOCKET_CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  },
  pingTimeout: 60_000,
  pingInterval: 25_000,
} as const;

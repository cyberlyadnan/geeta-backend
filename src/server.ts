import './config/load-env.js';
import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { registerEventListeners } from './events/index.js';
import { logger } from './logs/logger.js';
import { initializeSocket } from './websocket/index.js';
import { closeAllQueues } from './queues/index.js';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await connectRedis();
  registerEventListeners();

  const app = createApp();
  const httpServer = http.createServer(app);

  initializeSocket(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`${env.APP_NAME} running`, {
      port: env.PORT,
      env: env.NODE_ENV,
      api: `${env.API_PREFIX}/${env.API_VERSION}`,
    });
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    httpServer.close(() => {
      logger.info('HTTP server closed');
    });
    await closeAllQueues();
    await disconnectRedis();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err: unknown) => {
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});

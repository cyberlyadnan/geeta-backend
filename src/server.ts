import './config/load-env.js';
import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { registerEventListeners } from './events/index.js';
import { logger } from './logs/logger.js';
import { initializeSocket, emitCatalogVersionChanged } from './websocket/index.js';
import { onCatalogVersionChanged } from './services/catalog/catalog-invalidation.js';
import { closeAllQueues } from './queues/index.js';
import { scheduleSliderExpiryJob } from './jobs/slider-expiry.job.js';
import { walletConfig } from './config/wallet.js';
import { isRazorpayConfigured } from './services/razorpay/razorpay.errors.js';
import { getRazorpayClient } from './services/razorpay/razorpay.client.js';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await connectRedis();

  if (isRazorpayConfigured(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET)) {
    try {
      getRazorpayClient();
      logger.debug('Razorpay client warmed on startup');
    } catch (err: unknown) {
      logger.warn('Razorpay warmup skipped', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  await scheduleSliderExpiryJob().catch((err: unknown) => {
    logger.warn('Slider expiry scheduler skipped', { error: err });
  });
  registerEventListeners();

  const app = createApp();
  const httpServer = http.createServer(app);

  initializeSocket(httpServer);
  // Catalog writes bump a counter; that bump is pushed to connected clients here.
  onCatalogVersionChanged(emitCatalogVersionChanged);

  httpServer.listen(env.PORT, () => {
    logger.info(`${env.APP_NAME} running`, {
      port: env.PORT,
      env: env.NODE_ENV,
      api: `${env.API_PREFIX}/${env.API_VERSION}`,
      walletMinRecharge: walletConfig.minRechargeAmount,
      walletMaxRecharge: walletConfig.maxRechargeAmount,
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

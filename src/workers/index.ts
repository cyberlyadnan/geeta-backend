import '../config/load-env.js';
import type { Worker } from 'bullmq';
import {
  connectRedis,
  disconnectRedis,
  isRedisConnected,
  isRedisEnabled,
} from '../config/redis.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../logs/logger.js';
import {
  createNotificationWorker,
  createInvoiceWorker,
  createSlaWorker,
  createSliderExpiryWorker,
  createActivityLogWorker,
  createAnalyticsWorker,
  createArtworkProcessingWorker,
  createAccountingProjectionWorker,
  scheduleAccountingProjectionJob,
} from '../jobs/index.js';

const workers: Worker[] = [];

async function bootstrap(): Promise<void> {
  await connectDatabase();

  if (!isRedisEnabled()) {
    logger.error('Workers require Redis. Set REDIS_ENABLED=true and start Redis.');
    process.exit(1);
  }

  await connectRedis();

  if (!isRedisConnected()) {
    logger.error('Workers require an active Redis connection.');
    process.exit(1);
  }

  workers.push(
    createNotificationWorker(),
    createInvoiceWorker(),
    createSlaWorker(),
    createSliderExpiryWorker(),
    createActivityLogWorker(),
    createAnalyticsWorker(),
    createArtworkProcessingWorker(),
    createAccountingProjectionWorker(),
  );

  // Registering the repeat here (rather than in the API process) keeps the schedule owned by the
  // process that actually runs it.
  await scheduleAccountingProjectionJob();

  logger.info(`BullMQ workers started (${workers.length} workers)`);
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down workers...');
  await Promise.all(workers.map((w) => w.close()));
  await disconnectRedis();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

bootstrap().catch((err: unknown) => {
  logger.error('Worker bootstrap failed', { error: err });
  process.exit(1);
});

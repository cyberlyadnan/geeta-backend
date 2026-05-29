import { Queue, Worker } from 'bullmq';
import { bullmqConfig } from '../config/bullmq.js';
import { isRedisEnabled } from '../config/redis.js';
import { QUEUE_NAMES } from '../constants/queueNames.js';
import { logger } from '../logs/logger.js';
import { sliderService } from '../modules/slider/slider.service.js';

const REPEAT_EVERY_MS = 60 * 60 * 1000; // hourly

let sliderExpiryQueue: Queue | null = null;

export function getSliderExpiryQueue(): Queue | null {
  if (!isRedisEnabled()) return null;
  if (!sliderExpiryQueue) {
    sliderExpiryQueue = new Queue(QUEUE_NAMES.SLIDER_EXPIRY, {
      connection: bullmqConfig.connection,
      prefix: bullmqConfig.prefix,
    });
  }
  return sliderExpiryQueue;
}

export async function scheduleSliderExpiryJob(): Promise<void> {
  const queue = getSliderExpiryQueue();
  if (!queue) return;

  await queue.add(
    'mark-expired-slides',
    {},
    {
      repeat: { every: REPEAT_EVERY_MS },
      jobId: 'slider-expiry-repeat',
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );

  logger.info('Slider expiry repeat job scheduled');
}

export function createSliderExpiryWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.SLIDER_EXPIRY,
    async () => {
      const result = await sliderService.refreshExpiredSlides();
      logger.info('Slider expiry job completed', { count: result.count });
      return { updated: result.count };
    },
    {
      connection: bullmqConfig.connection,
      prefix: bullmqConfig.prefix,
    },
  );
}

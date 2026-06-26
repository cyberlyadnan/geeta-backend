import { Worker, type Job } from 'bullmq';
import { bullmqConfig } from '../config/bullmq.js';
import { QUEUE_NAMES } from '../constants/queueNames.js';
import type { ArtworkProcessingJobData } from '../queues/artwork-processing.queue.js';
import { artworkProcessingService } from '../modules/print-engine/services/artwork-processing.service.js';
import { logger } from '../logs/logger.js';

async function processArtwork(job: Job<ArtworkProcessingJobData>): Promise<void> {
  await artworkProcessingService.processArtworkVersion(
    job.data.artworkVersionId,
    job.data.versionId,
  );
}

export function createArtworkProcessingWorker(): Worker<ArtworkProcessingJobData> {
  const worker = new Worker<ArtworkProcessingJobData>(
    QUEUE_NAMES.ARTWORK_PROCESSING,
    processArtwork,
    {
      connection: bullmqConfig.connection,
      prefix: bullmqConfig.prefix,
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    logger.warn('Artwork processing job failed', {
      jobId: job?.id,
      artworkVersionId: job?.data.artworkVersionId,
      message: err.message,
    });
  });

  return worker;
}

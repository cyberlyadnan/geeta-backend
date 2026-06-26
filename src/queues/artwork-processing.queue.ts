import { getQueue } from './queue.factory.js';
import { QUEUE_NAMES } from '../constants/queueNames.js';

export interface ArtworkProcessingJobData {
  artworkVersionId: string;
  userId: string;
  versionId: string;
}

export async function enqueueArtworkProcessing(data: ArtworkProcessingJobData): Promise<boolean> {
  const queue = getQueue(QUEUE_NAMES.ARTWORK_PROCESSING);
  if (!queue) return false;

  await queue.add('process-artwork', data, {
    removeOnComplete: 5000,
    removeOnFail: 1000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  });
  return true;
}

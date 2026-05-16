import morgan from 'morgan';
import { env } from '../config/env.js';
import { logger } from '../logs/logger.js';

const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

export const requestLogger =
  env.NODE_ENV === 'production'
    ? morgan('combined', { stream })
    : morgan('dev', { stream });

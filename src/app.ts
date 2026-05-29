import express from 'express';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { paymentsWebhookRoutes } from './modules/payments/payments.webhook.routes.js';
import {
  compressionMiddleware,
  corsMiddleware,
  errorHandler,
  helmetMiddleware,
  notFoundHandler,
  rateLimiter,
  requestLogger,
} from './middleware/index.js';

export function createApp(): express.Application {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(compressionMiddleware);

  app.use(
    `${env.API_PREFIX}/${env.API_VERSION}/payments`,
    express.raw({ type: 'application/json' }),
    paymentsWebhookRoutes,
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(rateLimiter);

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: env.APP_NAME,
      api: `${env.API_PREFIX}/${env.API_VERSION}`,
    });
  });

  app.use(env.API_PREFIX, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

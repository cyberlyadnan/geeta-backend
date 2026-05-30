import { Router } from 'express';
import { env } from '../config/env.js';
import { walletConfig } from '../config/wallet.js';
import { v1Router } from './v1/index.js';

const apiRouter = Router();

apiRouter.use(`/${env.API_VERSION}`, v1Router);

apiRouter.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    version: env.API_VERSION,
    timestamp: new Date().toISOString(),
    wallet: {
      minRechargeAmount: walletConfig.minRechargeAmount,
      maxRechargeAmount: walletConfig.maxRechargeAmount,
    },
  });
});

export { apiRouter };

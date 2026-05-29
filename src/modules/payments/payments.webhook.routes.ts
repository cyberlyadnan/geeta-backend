import { Router } from 'express';
import { paymentsController } from './payments.controller.js';

/** Mounted with express.raw() — no JSON parser on this path */
const webhookRouter = Router();

webhookRouter.post('/webhook', paymentsController.webhook);

export { webhookRouter as paymentsWebhookRoutes };

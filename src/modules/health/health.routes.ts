import { Router } from 'express';
import { healthController } from './health.controller.js';

const router = Router();

router.get('/', healthController.overall);
router.get('/database', healthController.database);
router.get('/storage', healthController.storage);
router.get('/redis', healthController.redis);

export { router as healthRoutes };

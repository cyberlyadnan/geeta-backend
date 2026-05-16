import { Router } from 'express';
import { dashboardController } from './dashboard.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', dashboardController.list);
router.get('/:id', dashboardController.getById);

export { router as dashboardRoutes };

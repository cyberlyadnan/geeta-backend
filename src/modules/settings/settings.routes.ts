import { Router } from 'express';
import { settingsController } from './settings.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', settingsController.list);
router.get('/:id', settingsController.getById);

export { router as settingsRoutes };

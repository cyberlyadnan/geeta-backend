import { Router } from 'express';
import { reportsController } from './reports.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', reportsController.list);
router.get('/:id', reportsController.getById);

export { router as reportsRoutes };

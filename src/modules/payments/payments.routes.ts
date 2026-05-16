import { Router } from 'express';
import { paymentsController } from './payments.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', paymentsController.list);
router.get('/:id', paymentsController.getById);

export { router as paymentsRoutes };

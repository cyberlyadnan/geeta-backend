import { Router } from 'express';
import { ordersController } from './orders.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', ordersController.list);
router.get('/:id', ordersController.getById);

export { router as ordersRoutes };

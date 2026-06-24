import { Router } from 'express';
import { ordersController } from './orders.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../validators/validate.js';
import { createProductionOrderSchema, orderIdParamSchema } from './orders.validation.js';

const router = Router();

router.use(authenticate);
router.get('/', ordersController.list);
router.post('/', validate(createProductionOrderSchema), ordersController.create);
router.get('/:id', validate(orderIdParamSchema, 'params'), ordersController.getById);

export { router as ordersRoutes };

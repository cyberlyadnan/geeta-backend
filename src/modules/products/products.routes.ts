import { Router } from 'express';
import { productsController } from './products.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', productsController.list);
router.get('/:id', productsController.getById);

export { router as productsRoutes };

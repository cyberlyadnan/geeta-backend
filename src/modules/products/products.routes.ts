import { Router } from 'express';
import { productsController } from './products.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../validators/validate.js';
import { calculatePriceSchema } from '../admin-products/admin-products.validation.js';

const router = Router();

router.use(authenticate);
router.get('/', productsController.list);
router.get('/families', productsController.listFamilies);
router.get('/series', productsController.listSeries);
router.post('/calculate-price', validate(calculatePriceSchema), productsController.calculatePrice);
router.get('/matrix-availability', productsController.matrixAvailability);
router.get('/:id', productsController.getById);

export { router as productsRoutes };

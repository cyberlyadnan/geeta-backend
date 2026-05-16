import { Router } from 'express';
import { categoriesController } from './categories.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', categoriesController.list);
router.get('/:id', categoriesController.getById);

export { router as categoriesRoutes };

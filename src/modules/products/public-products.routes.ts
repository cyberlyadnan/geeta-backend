import { Router } from 'express';
import { productsController } from './products.controller.js';
import { categoriesController } from '../categories/categories.controller.js';

/** Unauthenticated catalog for the public website */
const router = Router();

router.get('/products', productsController.list);
router.get('/products/:id', productsController.getById);
router.get('/categories', categoriesController.list);

export { router as publicCatalogRoutes };

import { Router } from 'express';
import { productsController } from './products.controller.js';
import { categoriesController } from '../categories/categories.controller.js';
import { publicCacheHeaders } from '../../middleware/cache-headers.js';

/** Unauthenticated catalog for the public website */
const router = Router();

router.get('/products', publicCacheHeaders(120), productsController.list);
router.get('/products/:id', publicCacheHeaders(120), productsController.getById);
router.get('/categories', publicCacheHeaders(300), categoriesController.list);

export { router as publicCatalogRoutes };

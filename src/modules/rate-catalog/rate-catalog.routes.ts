import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { rateCatalogController } from './rate-catalog.controller.js';
import {
  rateCatalogCategoriesQuerySchema,
  rateCatalogExportQuerySchema,
  rateCatalogProductRatesQuerySchema,
  rateCatalogProductsQuerySchema,
  rateCatalogSearchQuerySchema,
} from './rate-catalog.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.VENDOR));

router.get('/categories', validate(rateCatalogCategoriesQuerySchema, 'query'), rateCatalogController.listCategories);
router.get('/products', validate(rateCatalogProductsQuerySchema, 'query'), rateCatalogController.listProducts);
router.get('/search', validate(rateCatalogSearchQuerySchema, 'query'), rateCatalogController.search);
router.get('/filters', rateCatalogController.getFilters);
router.get(
  '/products/:id/rates',
  validate(rateCatalogProductRatesQuerySchema, 'query'),
  rateCatalogController.getProductRates,
);
router.get(
  '/products/:id/export/pdf',
  validate(rateCatalogExportQuerySchema, 'query'),
  rateCatalogController.exportPdf,
);
router.get(
  '/products/:id/export/excel',
  validate(rateCatalogExportQuerySchema, 'query'),
  rateCatalogController.exportExcel,
);

export { router as rateCatalogRoutes };

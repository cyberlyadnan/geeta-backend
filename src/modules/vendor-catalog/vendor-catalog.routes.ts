import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { vendorCatalogController } from './vendor-catalog.controller.js';

const router = Router();

router.use(authenticate);
router.get('/bootstrap', vendorCatalogController.bootstrap);
router.get('/catalog/version', vendorCatalogController.catalogVersion);
router.get('/catalog/families/:familyId/products', vendorCatalogController.familyProducts);

export { router as vendorCatalogRoutes };

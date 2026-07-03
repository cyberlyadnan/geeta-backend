import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { adminProductsController } from './admin-products.controller.js';
import {
  attributeIdParamSchema,
  calculatePriceSchema,
  categoryIdParamSchema,
  createAttributeSchema,
  createCategorySchema,
  createFamilySchema,
  createPricingRuleSchema,
  createProductSchema,
  createSeriesSchema,
  familyIdParamSchema,
  listAttributesQuerySchema,
  listFamiliesQuerySchema,
  listPricingRulesQuerySchema,
  listProductsQuerySchema,
  listSeriesQuerySchema,
  pricingRuleIdParamSchema,
  productIdParamSchema,
  reorderCatalogSchema,
  seriesIdParamSchema,
  updateAttributeSchema,
  updateCategorySchema,
  updateFamilySchema,
  updatePricingRuleSchema,
  updateProductSchema,
  updateSeriesSchema,
  upsertQuantityTierSchema,
} from './admin-products.validation.js';
import { addProductImageSchema } from './admin-categories.service.js';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

// Products
router.get('/', validate(listProductsQuerySchema, 'query'), adminProductsController.list);
router.post('/', validate(createProductSchema), adminProductsController.create);
router.post('/calculate-price', validate(calculatePriceSchema), adminProductsController.previewPrice);

router.get('/:id', validate(productIdParamSchema, 'params'), adminProductsController.getById);
router.patch('/:id', validate(productIdParamSchema, 'params'), validate(updateProductSchema), adminProductsController.update);
router.delete('/:id', validate(productIdParamSchema, 'params'), adminProductsController.delete);
router.post('/:id/clone', validate(productIdParamSchema, 'params'), adminProductsController.clone);
router.post('/:id/publish', validate(productIdParamSchema, 'params'), adminProductsController.publish);
router.patch(
  '/:id/status',
  validate(productIdParamSchema, 'params'),
  validate(z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']) })),
  adminProductsController.updateStatus,
);

const imageIdParamSchema = z.object({ id: z.string().min(1), imageId: z.string().min(1) });
router.post(
  '/:id/images',
  validate(productIdParamSchema, 'params'),
  validate(addProductImageSchema),
  adminProductsController.addImage,
);
router.delete(
  '/:id/images/:imageId',
  validate(imageIdParamSchema, 'params'),
  adminProductsController.removeImage,
);

export { router as adminProductsRoutes };

const attributesRouter = Router();
attributesRouter.use(authenticate);
attributesRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

attributesRouter.get('/', validate(listAttributesQuerySchema, 'query'), adminProductsController.listAttributes);
attributesRouter.post('/', validate(createAttributeSchema), adminProductsController.createAttribute);
attributesRouter.patch(
  '/:id',
  validate(attributeIdParamSchema, 'params'),
  validate(updateAttributeSchema),
  adminProductsController.updateAttribute,
);
attributesRouter.delete('/:id', validate(attributeIdParamSchema, 'params'), adminProductsController.deleteAttribute);

export { attributesRouter as adminAttributesRoutes };

const pricingRouter = Router();
pricingRouter.use(authenticate);
pricingRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

pricingRouter.get('/', validate(listPricingRulesQuerySchema, 'query'), adminProductsController.listPricingRules);
pricingRouter.post('/', validate(createPricingRuleSchema), adminProductsController.createPricingRule);
pricingRouter.post('/quantity-tiers', validate(upsertQuantityTierSchema), adminProductsController.upsertQuantityTier);
pricingRouter.patch(
  '/:id',
  validate(pricingRuleIdParamSchema, 'params'),
  validate(updatePricingRuleSchema),
  adminProductsController.updatePricingRule,
);
pricingRouter.delete('/:id', validate(pricingRuleIdParamSchema, 'params'), adminProductsController.deletePricingRule);
pricingRouter.delete(
  '/quantity-tiers/:id',
  validate(pricingRuleIdParamSchema, 'params'),
  adminProductsController.deleteQuantityTier,
);

export { pricingRouter as adminPricingRulesRoutes };

const categoriesRouter = Router();
categoriesRouter.use(authenticate);
categoriesRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

categoriesRouter.get('/', adminProductsController.listCategories);
categoriesRouter.post('/', validate(createCategorySchema), adminProductsController.createCategory);
categoriesRouter.get(
  '/:id/catalog',
  validate(categoryIdParamSchema, 'params'),
  adminProductsController.getCategoryCatalog,
);
categoriesRouter.patch(
  '/:id',
  validate(categoryIdParamSchema, 'params'),
  validate(updateCategorySchema),
  adminProductsController.updateCategory,
);
categoriesRouter.delete('/:id', validate(categoryIdParamSchema, 'params'), adminProductsController.deleteCategory);

export { categoriesRouter as adminCategoriesRoutes };

const familiesRouter = Router();
familiesRouter.use(authenticate);
familiesRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

familiesRouter.get('/', validate(listFamiliesQuerySchema, 'query'), adminProductsController.listFamilies);
familiesRouter.post('/', validate(createFamilySchema), adminProductsController.createFamily);
familiesRouter.post('/reorder', validate(reorderCatalogSchema), adminProductsController.reorderFamilies);
familiesRouter.get('/:id', validate(familyIdParamSchema, 'params'), adminProductsController.getFamily);
familiesRouter.patch(
  '/:id',
  validate(familyIdParamSchema, 'params'),
  validate(updateFamilySchema),
  adminProductsController.updateFamily,
);
familiesRouter.delete('/:id', validate(familyIdParamSchema, 'params'), adminProductsController.deleteFamily);

export { familiesRouter as adminFamiliesRoutes };

const seriesRouter = Router();
seriesRouter.use(authenticate);
seriesRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

seriesRouter.get('/', validate(listSeriesQuerySchema, 'query'), adminProductsController.listSeries);
seriesRouter.post('/', validate(createSeriesSchema), adminProductsController.createSeries);
seriesRouter.post('/reorder', validate(reorderCatalogSchema), adminProductsController.reorderSeries);
seriesRouter.get('/:id', validate(seriesIdParamSchema, 'params'), adminProductsController.getSeries);
seriesRouter.patch(
  '/:id',
  validate(seriesIdParamSchema, 'params'),
  validate(updateSeriesSchema),
  adminProductsController.updateSeries,
);
seriesRouter.delete('/:id', validate(seriesIdParamSchema, 'params'), adminProductsController.deleteSeries);

export { seriesRouter as adminSeriesRoutes };

const catalogRouter = Router();
catalogRouter.use(authenticate);
catalogRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));
catalogRouter.get('/explorer', adminProductsController.getCatalogExplorer);

export { catalogRouter as adminCatalogRoutes };

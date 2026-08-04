import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { adminPricingSpineController } from './admin-pricing-spine.controller.js';
import {
  createModifierRuleSchema,
  createVendorOverrideSchema,
  deleteMatrixCellParamSchema,
  idParamSchema,
  listVendorOverridesQuerySchema,
  saveMatrixCellsSchema,
  updateFlexPricingSchema,
  updateModifierRuleSchema,
  versionIdQuerySchema,
} from './admin-pricing-spine.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/matrix', validate(versionIdQuerySchema, 'query'), adminPricingSpineController.getMatrix);
router.post('/matrix/cells', validate(saveMatrixCellsSchema), adminPricingSpineController.saveMatrixCells);
router.delete(
  '/matrix/cells/:id',
  validate(deleteMatrixCellParamSchema, 'params'),
  adminPricingSpineController.deleteMatrixCell,
);

router.post(
  '/matrix/modifier-rules',
  validate(createModifierRuleSchema),
  adminPricingSpineController.createModifierRule,
);
router.patch(
  '/matrix/modifier-rules/:id',
  validate(idParamSchema, 'params'),
  validate(updateModifierRuleSchema),
  adminPricingSpineController.updateModifierRule,
);
router.delete(
  '/matrix/modifier-rules/:id',
  validate(idParamSchema, 'params'),
  adminPricingSpineController.deleteModifierRule,
);

router.get('/flex', validate(versionIdQuerySchema, 'query'), adminPricingSpineController.getFlexPricing);
router.put('/flex', validate(updateFlexPricingSchema), adminPricingSpineController.updateFlexPricing);

router.get(
  '/vendor-overrides',
  validate(listVendorOverridesQuerySchema, 'query'),
  adminPricingSpineController.listVendorOverrides,
);
router.post(
  '/vendor-overrides',
  validate(createVendorOverrideSchema),
  adminPricingSpineController.createVendorOverride,
);
router.delete(
  '/vendor-overrides/:id',
  validate(idParamSchema, 'params'),
  adminPricingSpineController.deleteVendorOverride,
);

export { router as adminPricingSpineRoutes };

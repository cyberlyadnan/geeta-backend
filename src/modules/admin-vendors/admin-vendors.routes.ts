import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import {
  vendorComplianceAdminReviewRoutes,
  vendorComplianceAdminRoutes,
} from '../vendor-compliance/index.js';
import { adminVendorsController } from './admin-vendors.controller.js';
import { adminCreditController } from '../admin-credit/admin-credit.controller.js';
import { setCreditLimitSchema } from '../admin-credit/admin-credit.validation.js';
import { adminFileAssetAccessParamsSchema } from '../vendor-compliance/vendor-compliance.validation.js';
import {
  createAdminNoteSchema,
  listVendorsQuerySchema,
  updateVendorDeliveryPreferenceSchema,
  updateVendorStatusSchema,
  vendorActivityFeedQuerySchema,
  vendorIdParamSchema,
} from './admin-vendors.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/stats', adminVendorsController.stats);
// Must stay above '/:id' — otherwise Express matches "recently-ordered-for" as a vendor id.
router.get('/recently-ordered-for', adminVendorsController.recentlyOrderedFor);
router.get(
  '/activity-feed',
  validate(vendorActivityFeedQuerySchema, 'query'),
  adminVendorsController.activityFeed,
);
router.get('/', validate(listVendorsQuerySchema, 'query'), adminVendorsController.list);
router.use('/:vendorId/compliance-requests', vendorComplianceAdminRoutes);
router.use('/:vendorId/compliance-responses', vendorComplianceAdminReviewRoutes);
router.post(
  '/:id/file-assets/:fileAssetId/access',
  validate(adminFileAssetAccessParamsSchema, 'params'),
  adminVendorsController.fileAssetAccess,
);
router.get('/:id', validate(vendorIdParamSchema, 'params'), adminVendorsController.getById);
router.patch(
  '/:id/status',
  validate(vendorIdParamSchema, 'params'),
  validate(updateVendorStatusSchema),
  adminVendorsController.updateStatus,
);
router.patch(
  '/:id/delivery-preference',
  validate(vendorIdParamSchema, 'params'),
  validate(updateVendorDeliveryPreferenceSchema),
  adminVendorsController.updateDeliveryPreference,
);
router.post(
  '/:id/notes',
  validate(vendorIdParamSchema, 'params'),
  validate(createAdminNoteSchema),
  adminVendorsController.addNote,
);
router.post(
  '/:id/credit-account',
  validate(vendorIdParamSchema, 'params'),
  validate(setCreditLimitSchema),
  adminCreditController.setVendorCreditLimit,
);

export { router as adminVendorsRoutes };

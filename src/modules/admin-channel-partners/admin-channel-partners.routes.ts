import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { adminChannelPartnersController } from './admin-channel-partners.controller.js';
import {
  assignVendorsSchema,
  assignableVendorsQuerySchema,
  commissionPlanSchema,
  listPartnersQuerySchema,
  partnerIdParamSchema,
  partnerStatsQuerySchema,
  promoteVendorSchema,
  unassignVendorSchema,
  updatePartnerSchema,
} from './admin-channel-partners.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/', validate(listPartnersQuerySchema, 'query'), adminChannelPartnersController.list);
router.get('/stats', validate(partnerStatsQuerySchema, 'query'), adminChannelPartnersController.programmeStats);
router.post(
  '/',
  // Promoting a vendor grants them sight of other vendors' books — admin decision, not a manager's.
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(promoteVendorSchema),
  adminChannelPartnersController.promote,
);

router.get(
  '/:id',
  validate(partnerIdParamSchema, 'params'),
  validate(partnerStatsQuerySchema, 'query'),
  adminChannelPartnersController.detail,
);
router.patch(
  '/:id',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(partnerIdParamSchema, 'params'),
  validate(updatePartnerSchema),
  adminChannelPartnersController.update,
);
router.get(
  '/:id/assignable-vendors',
  validate(partnerIdParamSchema, 'params'),
  validate(assignableVendorsQuerySchema, 'query'),
  adminChannelPartnersController.assignableVendors,
);
router.post(
  '/:id/vendors',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(partnerIdParamSchema, 'params'),
  validate(assignVendorsSchema),
  adminChannelPartnersController.assignVendors,
);
router.delete(
  '/:id/vendors/:vendorId',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(partnerIdParamSchema, 'params'),
  validate(unassignVendorSchema),
  adminChannelPartnersController.unassignVendor,
);
router.post(
  '/:id/commission-plans',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(partnerIdParamSchema, 'params'),
  validate(commissionPlanSchema),
  adminChannelPartnersController.createCommissionPlan,
);

export { router as adminChannelPartnersRoutes };

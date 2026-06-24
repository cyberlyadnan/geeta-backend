import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { deliveryController } from './delivery.controller.js';
import {
  calculateOrderDeliverySchema,
  updateAdminDeliverySettingsSchema,
  updateDeliveryPreferenceSchema,
} from './delivery.validation.js';

const vendorRouter = Router();
vendorRouter.use(authenticate);
vendorRouter.get('/settings', deliveryController.getVendorSettings);
vendorRouter.patch(
  '/preference',
  validate(updateDeliveryPreferenceSchema),
  deliveryController.updateVendorPreference,
);
vendorRouter.post(
  '/calculate',
  validate(calculateOrderDeliverySchema),
  deliveryController.calculateOrderDelivery,
);

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));
adminRouter.get('/settings', deliveryController.getAdminSettings);
adminRouter.patch(
  '/settings',
  validate(updateAdminDeliverySettingsSchema),
  deliveryController.updateAdminSettings,
);

export { vendorRouter as deliveryRoutes, adminRouter as adminDeliveryRoutes };

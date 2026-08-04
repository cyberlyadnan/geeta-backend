import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { designApprovalController } from './design-approval.controller.js';
import {
  designTaskIdParamSchema,
  listDesignQueueQuerySchema,
  orderIdParamSchema,
  submitProofSchema,
  vendorDecisionSchema,
} from './design-approval.validation.js';

/** Design team / staff side. */
const designTasksRouter = Router();

designTasksRouter.use(authenticate);
designTasksRouter.use(
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER, RoleName.STAFF),
);

designTasksRouter.get(
  '/',
  validate(listDesignQueueQuerySchema, 'query'),
  designApprovalController.listQueue,
);
designTasksRouter.post(
  '/:id/proof',
  validate(designTaskIdParamSchema, 'params'),
  validate(submitProofSchema),
  designApprovalController.submitProof,
);

/**
 * Vendor side — mounted under /orders. Ownership is enforced in the service (the order must
 * belong to the authenticated vendor), so VENDOR is the expected role here; staff roles are
 * included because admin-created orders are placed on a vendor's behalf.
 */
const orderDesignRouter = Router({ mergeParams: true });

orderDesignRouter.use(authenticate);

orderDesignRouter.get(
  '/:orderId/design-approval',
  validate(orderIdParamSchema, 'params'),
  designApprovalController.getForOrder,
);
orderDesignRouter.post(
  '/:orderId/design-approval',
  validate(orderIdParamSchema, 'params'),
  validate(vendorDecisionSchema),
  designApprovalController.recordDecision,
);

export { designTasksRouter as designTaskRoutes, orderDesignRouter as orderDesignApprovalRoutes };

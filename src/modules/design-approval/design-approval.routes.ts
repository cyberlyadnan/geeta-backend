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
  presignDesignAttachmentSchema,
  presignDesignProofSchema,
  registerDesignAttachmentSchema,
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
  '/:id/start',
  validate(designTaskIdParamSchema, 'params'),
  designApprovalController.startTask,
);
designTasksRouter.post(
  '/:id/proof/presign',
  validate(designTaskIdParamSchema, 'params'),
  validate(presignDesignProofSchema),
  designApprovalController.presignProof,
);
designTasksRouter.post(
  '/:id/proof',
  validate(designTaskIdParamSchema, 'params'),
  validate(submitProofSchema),
  designApprovalController.submitProof,
);
designTasksRouter.post(
  '/:id/approve',
  validate(designTaskIdParamSchema, 'params'),
  designApprovalController.approveOnBehalf,
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

/**
 * Vendor side — reference-material uploads. Standalone (not under /orders): the vendor is still
 * filling out the order form, so no order or DesignTask exists yet to scope these to.
 */
const designAttachmentsRouter = Router();

designAttachmentsRouter.use(authenticate);

designAttachmentsRouter.post(
  '/presign',
  validate(presignDesignAttachmentSchema),
  designApprovalController.presignAttachment,
);
designAttachmentsRouter.post(
  '/register',
  validate(registerDesignAttachmentSchema),
  designApprovalController.registerAttachment,
);

export {
  designTasksRouter as designTaskRoutes,
  orderDesignRouter as orderDesignApprovalRoutes,
  designAttachmentsRouter as designAttachmentRoutes,
};

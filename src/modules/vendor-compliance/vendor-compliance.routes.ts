import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { complianceFileAccessRateLimit } from '../../middleware/security.js';
import { validate } from '../../validators/validate.js';
import {
  vendorComplianceAdminController,
  vendorCompliancePublicController,
} from './vendor-compliance.controller.js';
import {
  complianceRequestParamsSchema,
  createComplianceRequestSchema,
  reviewResponseSchema,
  responseParamsSchema,
  submitComplianceSchema,
  vendorComplianceFileAccessSchema,
  vendorCompliancePresignSchema,
  vendorIdParamSchema,
} from './vendor-compliance.validation.js';

const adminRouter = Router({ mergeParams: true });

adminRouter.use(authenticate);
adminRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

adminRouter.get('/', validate(vendorIdParamSchema, 'params'), vendorComplianceAdminController.list);
adminRouter.post(
  '/',
  validate(vendorIdParamSchema, 'params'),
  validate(createComplianceRequestSchema),
  vendorComplianceAdminController.create,
);
adminRouter.get(
  '/:requestId',
  validate(complianceRequestParamsSchema, 'params'),
  vendorComplianceAdminController.getById,
);
adminRouter.post(
  '/:requestId/send',
  validate(complianceRequestParamsSchema, 'params'),
  vendorComplianceAdminController.send,
);
adminRouter.post(
  '/:requestId/cancel',
  validate(complianceRequestParamsSchema, 'params'),
  vendorComplianceAdminController.cancel,
);

const adminReviewRouter = Router({ mergeParams: true });
adminReviewRouter.use(authenticate);
adminReviewRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));
adminReviewRouter.patch(
  '/:responseId/review',
  validate(responseParamsSchema, 'params'),
  validate(reviewResponseSchema),
  vendorComplianceAdminController.reviewResponse,
);

const publicRouter = Router();
publicRouter.post(
  '/presign-upload',
  validate(vendorCompliancePresignSchema),
  vendorCompliancePublicController.presignUpload,
);
publicRouter.post(
  '/file-access',
  complianceFileAccessRateLimit,
  validate(vendorComplianceFileAccessSchema),
  vendorCompliancePublicController.fileAccess,
);
publicRouter.post(
  '/submit',
  validate(submitComplianceSchema),
  vendorCompliancePublicController.submit,
);

export { adminRouter as vendorComplianceAdminRoutes, adminReviewRouter as vendorComplianceAdminReviewRoutes, publicRouter as vendorCompliancePublicRoutes };

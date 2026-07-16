import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { orderCancellationController } from './order-cancellation.controller.js';
import {
  adminOverrideCancelSchema,
  approveCancellationSchema,
  listCancellationRequestsQuerySchema,
  orderIdParamSchema,
  rejectCancellationSchema,
  requestIdParamSchema,
  updateCancellationReasonSchema,
  upsertCancellationPolicySchema,
  upsertCancellationReasonSchema,
  vendorCancelSchema,
  vendorRequestCancellationSchema,
} from './order-cancellation.validation.js';

const router = Router();

router.use(authenticate);

// Vendor-facing
router.get('/reasons', orderCancellationController.listReasons);

router.get(
  '/orders/:orderId/policy',
  validate(orderIdParamSchema, 'params'),
  orderCancellationController.getPolicy,
);

router.post(
  '/orders/:orderId/cancel',
  validate(orderIdParamSchema, 'params'),
  validate(vendorCancelSchema),
  orderCancellationController.vendorCancel,
);

router.post(
  '/orders/:orderId/cancellation-request',
  validate(orderIdParamSchema, 'params'),
  validate(vendorRequestCancellationSchema),
  orderCancellationController.vendorRequestCancellation,
);

// Production manager queue
const managerRoles = [RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER] as const;

router.get(
  '/requests/pending-count',
  authorize(...managerRoles),
  orderCancellationController.pendingCount,
);

router.get(
  '/requests',
  authorize(...managerRoles),
  validate(listCancellationRequestsQuerySchema, 'query'),
  orderCancellationController.listRequests,
);

router.get(
  '/requests/:requestId',
  validate(requestIdParamSchema, 'params'),
  orderCancellationController.getRequest,
);

router.post(
  '/requests/:requestId/approve',
  authorize(...managerRoles),
  validate(requestIdParamSchema, 'params'),
  validate(approveCancellationSchema),
  orderCancellationController.approveRequest,
);

router.post(
  '/requests/:requestId/reject',
  authorize(...managerRoles),
  validate(requestIdParamSchema, 'params'),
  validate(rejectCancellationSchema),
  orderCancellationController.rejectRequest,
);

// Admin override & configuration
router.post(
  '/admin/orders/:orderId/override-cancel',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(orderIdParamSchema, 'params'),
  validate(adminOverrideCancelSchema),
  orderCancellationController.adminOverrideCancel,
);

router.get(
  '/admin/reasons',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  orderCancellationController.adminListReasons,
);

router.post(
  '/admin/reasons',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(upsertCancellationReasonSchema),
  orderCancellationController.adminCreateReason,
);

router.patch(
  '/admin/reasons/:id',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(updateCancellationReasonSchema),
  orderCancellationController.adminUpdateReason,
);

router.get(
  '/admin/policies',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  orderCancellationController.adminListPolicies,
);

router.put(
  '/admin/policies',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(upsertCancellationPolicySchema),
  orderCancellationController.adminUpsertPolicy,
);

export { router as orderCancellationRoutes };

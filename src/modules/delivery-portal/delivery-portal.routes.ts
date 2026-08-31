import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { DELIVERY_PORTAL_ROLES } from '../../constants/roles.js';
import { deliveryPortalController } from './delivery-portal.controller.js';
import {
  assignmentIdParamSchema,
  deliverSchema,
  failSchema,
  listQueueQuerySchema,
  pickupSchema,
  uploadUrlSchema,
} from './delivery-portal.validation.js';

const router = Router();

router.use(authenticate);
/**
 * Role gets you through the door; your service tags decide what is behind it. Every handler
 * re-reads the caller's tags and refuses anything outside them, so this list is a coarse filter
 * and never the authorisation itself.
 */
router.use(authorize(...DELIVERY_PORTAL_ROLES));

router.get('/me', deliveryPortalController.me);
router.get('/queue', validate(listQueueQuerySchema, 'query'), deliveryPortalController.queue);
router.post('/upload-url', validate(uploadUrlSchema), deliveryPortalController.uploadUrl);

router.get('/consignments/:id', validate(assignmentIdParamSchema, 'params'), deliveryPortalController.get);
router.post(
  '/consignments/:id/accept',
  validate(assignmentIdParamSchema, 'params'),
  deliveryPortalController.accept,
);
router.post(
  '/consignments/:id/release',
  validate(assignmentIdParamSchema, 'params'),
  deliveryPortalController.release,
);
router.post(
  '/consignments/:id/pickup',
  validate(assignmentIdParamSchema, 'params'),
  validate(pickupSchema),
  deliveryPortalController.pickup,
);
router.post(
  '/consignments/:id/in-transit',
  validate(assignmentIdParamSchema, 'params'),
  deliveryPortalController.inTransit,
);
router.post(
  '/consignments/:id/deliver',
  validate(assignmentIdParamSchema, 'params'),
  validate(deliverSchema),
  deliveryPortalController.deliver,
);
router.post(
  '/consignments/:id/fail',
  validate(assignmentIdParamSchema, 'params'),
  validate(failSchema),
  deliveryPortalController.fail,
);
router.post(
  '/consignments/:id/retry',
  validate(assignmentIdParamSchema, 'params'),
  deliveryPortalController.retry,
);
router.post(
  '/consignments/:id/returned',
  validate(assignmentIdParamSchema, 'params'),
  deliveryPortalController.markReturned,
);

export { router as deliveryPortalRoutes };

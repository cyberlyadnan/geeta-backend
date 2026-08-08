import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { ordersController } from './orders.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import {
  createProductionOrderSchema,
  draftIdParamSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
  orderPreviewSchema,
  saveDraftSchema,
} from './orders.validation.js';
import { amendmentOrderIdParamSchema, requestAmendmentSchema } from './order-amendment.validation.js';

const router = Router();

router.use(authenticate);

const amendmentStaffRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.STAFF,
] as const;

router.post(
  '/:orderId/amendments',
  authorize(...amendmentStaffRoles),
  validate(amendmentOrderIdParamSchema, 'params'),
  validate(requestAmendmentSchema),
  ordersController.requestAmendment,
);
router.get(
  '/:orderId/amendments/context',
  authorize(...amendmentStaffRoles),
  validate(amendmentOrderIdParamSchema, 'params'),
  ordersController.amendmentContext,
);
router.post(
  '/:orderId/amendments/preview',
  authorize(...amendmentStaffRoles),
  validate(amendmentOrderIdParamSchema, 'params'),
  validate(requestAmendmentSchema),
  ordersController.previewAmendment,
);
// The customer's own view — no role gate, scoped to orders they own.
router.get(
  '/:orderId/amendments/mine',
  validate(amendmentOrderIdParamSchema, 'params'),
  ordersController.myAmendments,
);
router.get(
  '/:orderId/amendments',
  authorize(...amendmentStaffRoles),
  validate(amendmentOrderIdParamSchema, 'params'),
  ordersController.listAmendments,
);

router.post('/preview', validate(orderPreviewSchema), ordersController.preview);

router.get('/drafts', ordersController.listDrafts);
router.post('/drafts', validate(saveDraftSchema), ordersController.saveDraft);
router.delete('/drafts/:draftId', validate(draftIdParamSchema, 'params'), ordersController.deleteDraft);

router.get('/', validate(listOrdersQuerySchema, 'query'), ordersController.list);
router.post('/', validate(createProductionOrderSchema), ordersController.create);
router.post('/:id/reorder', validate(orderIdParamSchema, 'params'), ordersController.reorder);
router.get('/:id', validate(orderIdParamSchema, 'params'), ordersController.getById);

export { router as ordersRoutes };

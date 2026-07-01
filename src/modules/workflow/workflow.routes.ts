import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { workflowController } from './workflow.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import {
  advanceWorkflowSchema,
  workflowCursorQuerySchema,
  workflowIdParamSchema,
  workflowOrderIdParamSchema,
} from './workflow.validation.js';

const router = Router();

router.use(authenticate);

router.get(
  '/orders/:orderId',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER, RoleName.VENDOR),
  validate(workflowOrderIdParamSchema, 'params'),
  workflowController.getByOrderId,
);

router.get(
  '/:id',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER, RoleName.VENDOR),
  validate(workflowIdParamSchema, 'params'),
  workflowController.getById,
);

router.get(
  '/:id/tasks',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER),
  validate(workflowIdParamSchema, 'params'),
  validate(workflowCursorQuerySchema, 'query'),
  workflowController.getTasks,
);

router.get(
  '/:id/timeline',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER),
  validate(workflowIdParamSchema, 'params'),
  validate(workflowCursorQuerySchema, 'query'),
  workflowController.getTimeline,
);

router.post(
  '/:id/advance',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER),
  validate(workflowIdParamSchema, 'params'),
  validate(advanceWorkflowSchema),
  workflowController.advance,
);

export { router as workflowRoutes };

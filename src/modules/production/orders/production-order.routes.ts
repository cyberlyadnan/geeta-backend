import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorize } from '../../../middleware/authorize.js';
import { validate } from '../../../validators/validate.js';
import { productionOrderController } from './production-order.controller.js';
import {
  activityQuerySchema,
  listProductionOrdersQuerySchema,
  orderIdParamSchema,
  timelineQuerySchema,
} from './production-order.validation.js';

const router = Router();
router.use(authenticate);

const viewRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.STAFF,
] as const;

router.get(
  '/orders',
  authorize(...viewRoles),
  validate(listProductionOrdersQuerySchema, 'query'),
  productionOrderController.list,
);

router.get(
  '/orders/:orderId',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  productionOrderController.getById,
);

router.get(
  '/orders/:orderId/workflow',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  productionOrderController.workflow,
);

router.get(
  '/orders/:orderId/tasks',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  productionOrderController.tasks,
);

router.get(
  '/orders/:orderId/amendments',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  productionOrderController.amendments,
);

router.get(
  '/orders/:orderId/timeline',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  validate(timelineQuerySchema, 'query'),
  productionOrderController.timeline,
);

router.get(
  '/orders/:orderId/files',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  productionOrderController.files,
);

router.get(
  '/orders/:orderId/activity',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  validate(activityQuerySchema, 'query'),
  productionOrderController.activity,
);

router.get(
  '/orders/:orderId/artwork',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  productionOrderController.artwork,
);

router.get(
  '/orders/:orderId/qc',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  productionOrderController.qc,
);

router.get(
  '/orders/:orderId/machines',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  productionOrderController.machines,
);

router.get(
  '/orders/:orderId/notes',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  productionOrderController.notes,
);

router.get(
  '/orders/:orderId/job-card',
  authorize(...viewRoles),
  validate(orderIdParamSchema, 'params'),
  productionOrderController.jobCard,
);

export { router as productionOrderRoutes };

import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorize } from '../../../middleware/authorize.js';
import { validate } from '../../../validators/validate.js';
import { controlCenterController } from './control-center.controller.js';
import {
  alertsQuerySchema,
  orderIdParamSchema,
  timelineQuerySchema,
} from './control-center.validation.js';

const router = Router();
router.use(authenticate);

const productionRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.STAFF,
] as const;

router.get(
  '/control-center',
  authorize(...productionRoles),
  controlCenterController.dashboard,
);

router.get(
  '/control-center/overview',
  authorize(...productionRoles),
  controlCenterController.overview,
);

router.get(
  '/control-center/departments',
  authorize(...productionRoles),
  controlCenterController.departments,
);

router.get(
  '/control-center/kpis',
  authorize(...productionRoles),
  controlCenterController.kpis,
);

router.get(
  '/control-center/heatmap',
  authorize(...productionRoles),
  controlCenterController.heatmap,
);

router.get(
  '/control-center/timeline',
  authorize(...productionRoles),
  validate(timelineQuerySchema, 'query'),
  controlCenterController.timeline,
);

router.get(
  '/control-center/alerts',
  authorize(...productionRoles),
  validate(alertsQuerySchema, 'query'),
  controlCenterController.alerts,
);

router.get(
  '/control-center/orders/:orderId',
  authorize(...productionRoles),
  validate(orderIdParamSchema, 'params'),
  controlCenterController.orderDrillDown,
);

export { router as controlCenterRoutes };

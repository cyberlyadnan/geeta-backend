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

const managerRoles = [RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER] as const;

router.get(
  '/control-center',
  authorize(...managerRoles),
  controlCenterController.dashboard,
);

router.get(
  '/control-center/overview',
  authorize(...managerRoles),
  controlCenterController.overview,
);

router.get(
  '/control-center/departments',
  authorize(...managerRoles),
  controlCenterController.departments,
);

router.get(
  '/control-center/kpis',
  authorize(...managerRoles),
  controlCenterController.kpis,
);

router.get(
  '/control-center/heatmap',
  authorize(...managerRoles),
  controlCenterController.heatmap,
);

router.get(
  '/control-center/timeline',
  authorize(...managerRoles),
  validate(timelineQuerySchema, 'query'),
  controlCenterController.timeline,
);

router.get(
  '/control-center/alerts',
  authorize(...managerRoles),
  validate(alertsQuerySchema, 'query'),
  controlCenterController.alerts,
);

router.get(
  '/control-center/orders/:orderId',
  authorize(...managerRoles),
  validate(orderIdParamSchema, 'params'),
  controlCenterController.orderDrillDown,
);

export { router as controlCenterRoutes };

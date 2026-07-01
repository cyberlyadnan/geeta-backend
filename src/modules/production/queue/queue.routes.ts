import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorize } from '../../../middleware/authorize.js';
import { validate } from '../../../validators/validate.js';
import { queueController } from './queue.controller.js';
import {
  departmentIdParamSchema,
  departmentQueueQuerySchema,
  departmentQueueTaskParamSchema,
} from './queue.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER, RoleName.STAFF));

router.get('/departments', queueController.listDepartments);

router.get(
  '/departments/:departmentId/queue',
  validate(departmentIdParamSchema, 'params'),
  validate(departmentQueueQuerySchema, 'query'),
  queueController.getDepartmentQueue,
);

router.get(
  '/departments/:departmentId/queue/:taskId',
  validate(departmentQueueTaskParamSchema, 'params'),
  queueController.getTaskDetail,
);

export { router as productionQueueRoutes };

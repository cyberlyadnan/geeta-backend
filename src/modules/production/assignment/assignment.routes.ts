import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorize } from '../../../middleware/authorize.js';
import { validate } from '../../../validators/validate.js';
import { assignmentController } from './assignment.controller.js';
import {
  assignTaskSchema,
  assignmentIdParamSchema,
  myTasksQuerySchema,
  operatorSearchQuerySchema,
  reassignTaskSchema,
  taskIdParamSchema,
  unassignTaskSchema,
} from './assignment.validation.js';
import { workflowCursorQuerySchema } from '../../workflow/workflow.validation.js';

const router = Router();

router.use(authenticate);

router.get(
  '/operators',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER),
  validate(operatorSearchQuerySchema, 'query'),
  assignmentController.searchOperators,
);

router.get(
  '/my-tasks',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER, RoleName.STAFF),
  validate(myTasksQuerySchema, 'query'),
  assignmentController.myTasks,
);

router.post(
  '/assignments',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER),
  validate(assignTaskSchema),
  assignmentController.assign,
);

router.post(
  '/assignments/:assignmentId/reassign',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER),
  validate(assignmentIdParamSchema, 'params'),
  validate(reassignTaskSchema),
  assignmentController.reassign,
);

router.post(
  '/assignments/:assignmentId/unassign',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER),
  validate(assignmentIdParamSchema, 'params'),
  validate(unassignTaskSchema),
  assignmentController.unassign,
);

router.get(
  '/tasks/:taskId/assignment',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER, RoleName.STAFF),
  validate(taskIdParamSchema, 'params'),
  assignmentController.getCurrent,
);

router.get(
  '/tasks/:taskId/assignment/history',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER, RoleName.STAFF),
  validate(taskIdParamSchema, 'params'),
  validate(workflowCursorQuerySchema, 'query'),
  assignmentController.getHistory,
);

export { router as assignmentRoutes };

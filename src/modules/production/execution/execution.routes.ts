import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorize } from '../../../middleware/authorize.js';
import { validate } from '../../../validators/validate.js';
import { executionController } from './execution.controller.js';
import {
  addNoteSchema,
  alertSchema,
  departmentExecutionQuerySchema,
  departmentIdParamSchema,
  executionActionSchema,
  flagForCorrectionSchema,
  holdTaskSchema,
  listNotesQuerySchema,
  presignAttachmentSchema,
  registerAttachmentSchema,
  resolveCorrectionSchema,
  taskIdParamSchema,
} from './execution.validation.js';

const router = Router();

router.use(authenticate);

const executionRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.STAFF,
] as const;

router.get(
  '/departments/:departmentId/execution',
  authorize(...executionRoles),
  validate(departmentIdParamSchema, 'params'),
  validate(departmentExecutionQuerySchema, 'query'),
  executionController.departmentExecution,
);

router.get(
  '/tasks/:taskId/execution',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  executionController.getExecution,
);

router.post(
  '/tasks/:taskId/start',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(executionActionSchema),
  executionController.start,
);

router.post(
  '/tasks/:taskId/pause',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(executionActionSchema),
  executionController.pause,
);

router.post(
  '/tasks/:taskId/resume',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(executionActionSchema),
  executionController.resume,
);

router.post(
  '/tasks/:taskId/hold',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(holdTaskSchema),
  executionController.hold,
);

router.post(
  '/tasks/:taskId/release-hold',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(executionActionSchema),
  executionController.releaseHold,
);

router.post(
  '/tasks/:taskId/complete',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(executionActionSchema),
  executionController.complete,
);

router.post(
  '/tasks/:taskId/flag-improper',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(flagForCorrectionSchema),
  executionController.flagForCorrection,
);

router.post(
  '/tasks/:taskId/resolve-correction',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(resolveCorrectionSchema),
  executionController.resolveCorrection,
);

router.get(
  '/tasks/:taskId/notes',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(listNotesQuerySchema, 'query'),
  executionController.listNotes,
);

router.post(
  '/tasks/:taskId/notes',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(addNoteSchema),
  executionController.addNote,
);

router.post(
  '/tasks/:taskId/attachments/presign',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(presignAttachmentSchema),
  executionController.presignAttachment,
);

router.post(
  '/tasks/:taskId/attachments',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(registerAttachmentSchema),
  executionController.registerAttachment,
);

router.get(
  '/tasks/:taskId/attachments',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(listNotesQuerySchema, 'query'),
  executionController.listAttachments,
);

router.post(
  '/tasks/:taskId/request-supervisor',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(alertSchema),
  executionController.requestSupervisor,
);

router.post(
  '/tasks/:taskId/report-issue',
  authorize(...executionRoles),
  validate(taskIdParamSchema, 'params'),
  validate(alertSchema),
  executionController.reportIssue,
);

export { router as executionRoutes };

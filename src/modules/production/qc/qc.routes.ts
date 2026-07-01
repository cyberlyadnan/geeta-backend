import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorize } from '../../../middleware/authorize.js';
import { validate } from '../../../validators/validate.js';
import { qcController } from './qc.controller.js';
import {
  addDefectSchema,
  addNoteSchema,
  departmentIdParamSchema,
  inspectionIdParamSchema,
  presignAttachmentSchema,
  qcMetricsQuerySchema,
  registerAttachmentSchema,
  startInspectionSchema,
  submitInspectionSchema,
  taskIdParamSchema,
  updateChecklistSchema,
} from './qc.validation.js';

const router = Router();
router.use(authenticate);

const qcRoles = [RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER, RoleName.STAFF] as const;

router.get(
  '/metrics',
  authorize(...qcRoles),
  validate(qcMetricsQuerySchema, 'query'),
  qcController.metrics,
);

router.get(
  '/departments/:departmentId/qc-queue',
  authorize(...qcRoles),
  validate(departmentIdParamSchema, 'params'),
  qcController.queue,
);

router.get(
  '/tasks/:taskId/inspection',
  authorize(...qcRoles),
  validate(taskIdParamSchema, 'params'),
  qcController.getForTask,
);

router.post(
  '/tasks/:taskId/inspection/start',
  authorize(...qcRoles),
  validate(taskIdParamSchema, 'params'),
  validate(startInspectionSchema),
  qcController.start,
);

router.patch(
  '/inspections/:inspectionId/checklist',
  authorize(...qcRoles),
  validate(inspectionIdParamSchema, 'params'),
  validate(updateChecklistSchema),
  qcController.updateChecklist,
);

router.post(
  '/inspections/:inspectionId/defects',
  authorize(...qcRoles),
  validate(inspectionIdParamSchema, 'params'),
  validate(addDefectSchema),
  qcController.addDefect,
);

router.post(
  '/inspections/:inspectionId/notes',
  authorize(...qcRoles),
  validate(inspectionIdParamSchema, 'params'),
  validate(addNoteSchema),
  qcController.addNote,
);

router.post(
  '/inspections/:inspectionId/attachments/presign',
  authorize(...qcRoles),
  validate(inspectionIdParamSchema, 'params'),
  validate(presignAttachmentSchema),
  qcController.presignAttachment,
);

router.post(
  '/inspections/:inspectionId/attachments',
  authorize(...qcRoles),
  validate(inspectionIdParamSchema, 'params'),
  validate(registerAttachmentSchema),
  qcController.registerAttachment,
);

router.post(
  '/inspections/:inspectionId/submit',
  authorize(...qcRoles),
  validate(inspectionIdParamSchema, 'params'),
  validate(submitInspectionSchema),
  qcController.submit,
);

export { router as qcRoutes };

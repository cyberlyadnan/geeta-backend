import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import {
  createWorkflowTemplateSchema,
  cursorQuerySchema,
  idParamSchema,
  linkProductWorkflowSchema,
  saveWorkflowStepsSchema,
  updateWorkflowTemplateSchema,
} from '../system-admin/system-admin.validation.js';
import { adminWorkflowController } from './admin-workflow.controller.js';

const router = Router();
router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN));

router.get('/departments', validate(cursorQuerySchema, 'query'), adminWorkflowController.listDepartments);

router.get('/templates', validate(cursorQuerySchema, 'query'), adminWorkflowController.listWorkflows);
router.get('/templates/:id', validate(idParamSchema, 'params'), adminWorkflowController.getWorkflow);
router.post('/templates', validate(createWorkflowTemplateSchema), adminWorkflowController.createWorkflow);
router.patch(
  '/templates/:id',
  validate(idParamSchema, 'params'),
  validate(updateWorkflowTemplateSchema),
  adminWorkflowController.updateWorkflow,
);
router.post(
  '/templates/:id/duplicate',
  validate(idParamSchema, 'params'),
  validate(z.object({ newCode: z.string(), newName: z.string() })),
  adminWorkflowController.duplicateWorkflow,
);
router.post('/templates/:id/archive', validate(idParamSchema, 'params'), adminWorkflowController.archiveWorkflow);
router.put(
  '/templates/:id/steps',
  validate(idParamSchema, 'params'),
  validate(saveWorkflowStepsSchema),
  adminWorkflowController.saveWorkflowSteps,
);

router.get(
  '/product-links',
  validate(cursorQuerySchema.extend({ unlinkedOnly: z.coerce.boolean().optional() }), 'query'),
  adminWorkflowController.listProductWorkflows,
);
router.post('/product-links', validate(linkProductWorkflowSchema), adminWorkflowController.linkProductWorkflow);

export { router as adminWorkflowRoutes };

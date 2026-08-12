import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { systemAdminController } from './system-admin.controller.js';
import {
  assignDepartmentsSchema,
  createDepartmentSchema,
  createQcTemplateSchema,
  createSystemUserSchema,
  createWorkflowTemplateSchema,
  cursorQuerySchema,
  idParamSchema,
  linkProductWorkflowSchema,
  listSystemUsersQuerySchema,
  resetPasswordSchema,
  runSeedSchema,
  saveWorkflowStepsSchema,
  updateDepartmentSchema,
  updateRolePermissionsSchema,
  updateSystemUserSchema,
  updateWorkflowTemplateSchema,
} from './system-admin.validation.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN));

// Users
router.get('/users', validate(listSystemUsersQuerySchema, 'query'), systemAdminController.listUsers);
router.get('/users/:id', validate(idParamSchema, 'params'), systemAdminController.getUser);
router.post('/users', validate(createSystemUserSchema), systemAdminController.createUser);
router.patch('/users/:id', validate(idParamSchema, 'params'), validate(updateSystemUserSchema), systemAdminController.updateUser);
router.post('/users/:id/deactivate', validate(idParamSchema, 'params'), systemAdminController.deactivateUser);
router.post('/users/:id/reset-password', validate(idParamSchema, 'params'), validate(resetPasswordSchema), systemAdminController.resetPassword);
router.put('/users/:id/departments', validate(idParamSchema, 'params'), validate(assignDepartmentsSchema), systemAdminController.assignDepartments);

// Roles
router.get('/roles', systemAdminController.listRoles);
router.get('/roles/permission-matrix', systemAdminController.permissionMatrix);
router.patch('/roles/:id', validate(idParamSchema, 'params'), validate(updateRolePermissionsSchema), systemAdminController.updateRole);

// Departments
router.get('/departments', validate(cursorQuerySchema, 'query'), systemAdminController.listDepartments);
router.get('/departments/:id', validate(idParamSchema, 'params'), systemAdminController.getDepartment);
router.post('/departments', validate(createDepartmentSchema), systemAdminController.createDepartment);
router.patch('/departments/:id', validate(idParamSchema, 'params'), validate(updateDepartmentSchema), systemAdminController.updateDepartment);

// Workflow templates
router.get('/workflows', validate(cursorQuerySchema, 'query'), systemAdminController.listWorkflows);
router.get('/workflows/:id', validate(idParamSchema, 'params'), systemAdminController.getWorkflow);
router.post('/workflows', validate(createWorkflowTemplateSchema), systemAdminController.createWorkflow);
router.patch('/workflows/:id', validate(idParamSchema, 'params'), validate(updateWorkflowTemplateSchema), systemAdminController.updateWorkflow);
router.post(
  '/workflows/:id/duplicate',
  validate(idParamSchema, 'params'),
  validate(z.object({ newCode: z.string(), newName: z.string() })),
  systemAdminController.duplicateWorkflow,
);
router.post('/workflows/:id/archive', validate(idParamSchema, 'params'), systemAdminController.archiveWorkflow);
router.put('/workflows/:id/steps', validate(idParamSchema, 'params'), validate(saveWorkflowStepsSchema), systemAdminController.saveWorkflowSteps);
router.get('/workflows/:id/config-fields', validate(idParamSchema, 'params'), systemAdminController.getWorkflowConfigFields);

// Product workflows
router.get('/product-workflows', validate(cursorQuerySchema.extend({ unlinkedOnly: z.coerce.boolean().optional() }), 'query'), systemAdminController.listProductWorkflows);
router.post('/product-workflows/link', validate(linkProductWorkflowSchema), systemAdminController.linkProductWorkflow);

// QC templates
router.get('/qc/templates', validate(cursorQuerySchema, 'query'), systemAdminController.listQcTemplates);
router.get('/qc/templates/:id', validate(idParamSchema, 'params'), systemAdminController.getQcTemplate);
router.post('/qc/templates', validate(createQcTemplateSchema), systemAdminController.upsertQcTemplate);
router.put('/qc/templates/:id', validate(idParamSchema, 'params'), validate(createQcTemplateSchema), systemAdminController.upsertQcTemplate);

// Validator
router.get('/validator', systemAdminController.runValidator);

// Debug
router.get('/debug', systemAdminController.debugOverview);
router.get('/debug/:entity', validate(cursorQuerySchema, 'query'), systemAdminController.debugEntity);

// Seed (dev only)
router.post('/seed/run', validate(runSeedSchema), systemAdminController.runSeed);
router.post('/seed/clear-demo', systemAdminController.clearDemoData);
router.get('/seed/reset-hint', systemAdminController.resetDevHint);

// Unified health
router.get('/health', systemAdminController.unifiedHealth);

export { router as systemAdminRoutes };

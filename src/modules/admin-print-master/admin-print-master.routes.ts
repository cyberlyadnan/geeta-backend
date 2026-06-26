import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import {
  adminPrintMasterController,
} from './admin-print-master.controller.js';
import {
  assignProductPrintConfigSchema,
  bulkIdsSchema,
  createCoverageRuleSchema,
  createFileUploadRuleSchema,
  createMasterRuleSchema,
  createMeasurementUnitSchema,
  createPrintProcessSchema,
  createPrintSpecTemplateSchema,
  createSheetSizeSchema,
  createSizeTemplateSchema,
  idParamSchema,
  listMasterQuerySchema,
  updateCoverageRuleSchema,
  updateFileUploadRuleSchema,
  updateMasterRuleSchema,
  updateMeasurementUnitSchema,
  updatePrintProcessSchema,
  updatePrintSpecTemplateSchema,
  updateSheetSizeSchema,
  updateSizeTemplateSchema,
} from './admin-print-master.validation.js';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

const q = validate(listMasterQuerySchema, 'query');
const id = validate(idParamSchema, 'params');
const versionId = validate(z.object({ versionId: z.string().min(1) }), 'params');

router.get('/dashboard', adminPrintMasterController.dashboard);
router.get('/activity', q, adminPrintMasterController.activity);

// Measurement units
router.get('/units', q, adminPrintMasterController.listUnits);
router.post('/units', validate(createMeasurementUnitSchema), adminPrintMasterController.createUnit);
router.patch('/units/:id', id, validate(updateMeasurementUnitSchema), adminPrintMasterController.updateUnit);
router.delete('/units/:id', id, adminPrintMasterController.deleteUnit);

// Sheet sizes
router.get('/sheet-sizes', q, adminPrintMasterController.listSheetSizes);
router.get('/sheet-sizes/:id', id, adminPrintMasterController.getSheetSize);
router.post('/sheet-sizes', validate(createSheetSizeSchema), adminPrintMasterController.createSheetSize);
router.patch('/sheet-sizes/:id', id, validate(updateSheetSizeSchema), adminPrintMasterController.updateSheetSize);
router.post('/sheet-sizes/:id/duplicate', id, adminPrintMasterController.duplicateSheetSize);
router.post(
  '/sheet-sizes/bulk-status',
  validate(bulkIdsSchema.extend({ status: z.enum(['ACTIVE', 'INACTIVE']) })),
  adminPrintMasterController.bulkSheetSizeStatus,
);
router.delete('/sheet-sizes/:id', id, adminPrintMasterController.deleteSheetSize);

// Size templates
router.get('/size-templates', q, adminPrintMasterController.listSizeTemplates);
router.get('/size-templates/:id', id, adminPrintMasterController.getSizeTemplate);
router.post('/size-templates', validate(createSizeTemplateSchema), adminPrintMasterController.createSizeTemplate);
router.patch('/size-templates/:id', id, validate(updateSizeTemplateSchema), adminPrintMasterController.updateSizeTemplate);
router.post('/size-templates/:id/duplicate', id, adminPrintMasterController.duplicateSizeTemplate);
router.delete('/size-templates/:id', id, adminPrintMasterController.deleteSizeTemplate);

// Print processes
router.get('/print-processes', q, adminPrintMasterController.listPrintProcesses);
router.post('/print-processes', validate(createPrintProcessSchema), adminPrintMasterController.createPrintProcess);
router.patch('/print-processes/:id', id, validate(updatePrintProcessSchema), adminPrintMasterController.updatePrintProcess);
router.delete('/print-processes/:id', id, adminPrintMasterController.deletePrintProcess);

// Print specification templates
router.get('/print-specifications', q, adminPrintMasterController.listPrintSpecTemplates);
router.post('/print-specifications', validate(createPrintSpecTemplateSchema), adminPrintMasterController.createPrintSpecTemplate);
router.patch('/print-specifications/:id', id, validate(updatePrintSpecTemplateSchema), adminPrintMasterController.updatePrintSpecTemplate);
router.delete('/print-specifications/:id', id, adminPrintMasterController.deletePrintSpecTemplate);

// Artwork rules
router.get('/artwork-rules', q, adminPrintMasterController.listArtworkRules);
router.post('/artwork-rules', validate(createMasterRuleSchema), adminPrintMasterController.createArtworkRule);
router.patch('/artwork-rules/:id', id, validate(updateMasterRuleSchema), adminPrintMasterController.updateArtworkRule);
router.delete('/artwork-rules/:id', id, adminPrintMasterController.deleteArtworkRule);

// Validation rules
router.get('/validation-rules', q, adminPrintMasterController.listValidationRules);
router.post('/validation-rules', validate(createMasterRuleSchema), adminPrintMasterController.createValidationRule);
router.patch('/validation-rules/:id', id, validate(updateMasterRuleSchema), adminPrintMasterController.updateValidationRule);
router.delete('/validation-rules/:id', id, adminPrintMasterController.deleteValidationRule);

// Coverage rules
router.get('/coverage-rules', q, adminPrintMasterController.listCoverageRules);
router.post('/coverage-rules', validate(createCoverageRuleSchema), adminPrintMasterController.createCoverageRule);
router.patch('/coverage-rules/:id', id, validate(updateCoverageRuleSchema), adminPrintMasterController.updateCoverageRule);
router.delete('/coverage-rules/:id', id, adminPrintMasterController.deleteCoverageRule);

// File upload rules
router.get('/file-upload-rules', q, adminPrintMasterController.listFileUploadRules);
router.post('/file-upload-rules', validate(createFileUploadRuleSchema), adminPrintMasterController.createFileUploadRule);
router.patch('/file-upload-rules/:id', id, validate(updateFileUploadRuleSchema), adminPrintMasterController.updateFileUploadRule);
router.delete('/file-upload-rules/:id', id, adminPrintMasterController.deleteFileUploadRule);

// Product print config
router.get('/product-config/:versionId', versionId, adminPrintMasterController.getProductPrintConfig);
router.put(
  '/product-config/:versionId',
  versionId,
  validate(assignProductPrintConfigSchema),
  adminPrintMasterController.assignProductPrintConfig,
);

export { router as adminPrintMasterRoutes };

import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { adminVendorsController } from './admin-vendors.controller.js';
import {
  createAdminNoteSchema,
  listVendorsQuerySchema,
  updateVendorStatusSchema,
  vendorIdParamSchema,
} from './admin-vendors.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/stats', adminVendorsController.stats);
router.get('/', validate(listVendorsQuerySchema, 'query'), adminVendorsController.list);
router.get('/:id', validate(vendorIdParamSchema, 'params'), adminVendorsController.getById);
router.patch(
  '/:id/status',
  validate(vendorIdParamSchema, 'params'),
  validate(updateVendorStatusSchema),
  adminVendorsController.updateStatus,
);
router.post(
  '/:id/notes',
  validate(vendorIdParamSchema, 'params'),
  validate(createAdminNoteSchema),
  adminVendorsController.addNote,
);

export { router as adminVendorsRoutes };

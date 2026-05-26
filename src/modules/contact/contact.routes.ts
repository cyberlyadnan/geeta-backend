import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { contactController } from './contact.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeMinRole } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import {
  createContactInquirySchema,
  listContactInquiriesSchema,
  updateContactInquiryStatusSchema,
} from './contact.validation.js';

const router = Router();

router.post(
  '/inquiries',
  validate(createContactInquirySchema),
  contactController.create,
);

router.use(authenticate);
router.use(authorizeMinRole(RoleName.MANAGER));

router.get(
  '/inquiries',
  validate(listContactInquiriesSchema, 'query'),
  contactController.list,
);

router.get('/inquiries/:id', contactController.getById);

router.patch(
  '/inquiries/:id/status',
  validate(updateContactInquiryStatusSchema),
  contactController.updateStatus,
);

export { router as contactRoutes };

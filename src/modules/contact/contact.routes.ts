import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { contactController } from './contact.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeMinRole } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import {
  addContactInquiryNoteSchema,
  contactInquiryIdParamSchema,
  createContactInquirySchema,
  listContactInquiriesSchema,
  updateContactInquirySchema,
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

router.get('/inquiries/stats', contactController.stats);
router.get('/inquiries/assignees', contactController.listAssignees);

router.get(
  '/inquiries',
  validate(listContactInquiriesSchema, 'query'),
  contactController.list,
);

router.get(
  '/inquiries/:id',
  validate(contactInquiryIdParamSchema, 'params'),
  contactController.getById,
);

router.patch(
  '/inquiries/:id',
  validate(contactInquiryIdParamSchema, 'params'),
  validate(updateContactInquirySchema),
  contactController.update,
);

router.patch(
  '/inquiries/:id/status',
  validate(contactInquiryIdParamSchema, 'params'),
  validate(updateContactInquiryStatusSchema),
  contactController.updateStatus,
);

router.post(
  '/inquiries/:id/notes',
  validate(contactInquiryIdParamSchema, 'params'),
  validate(addContactInquiryNoteSchema),
  contactController.addNote,
);

export { router as contactRoutes };

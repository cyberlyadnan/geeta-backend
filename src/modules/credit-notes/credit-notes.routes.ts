import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { creditNotesController } from './credit-notes.controller.js';
import {
  cancelCreditNoteSchema,
  createCreditNoteSchema,
  creditNoteIdParamSchema,
  creditNoteListQuerySchema,
} from './credit-notes.validation.js';

const router = Router();

router.use(authenticate);
// Issuing a credit note reduces both revenue and GST liability, so it stays with management.
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/', validate(creditNoteListQuerySchema, 'query'), creditNotesController.list);
router.post('/', validate(createCreditNoteSchema), creditNotesController.create);
router.get('/:id', validate(creditNoteIdParamSchema, 'params'), creditNotesController.getById);
router.post(
  '/:id/cancel',
  validate(creditNoteIdParamSchema, 'params'),
  validate(cancelCreditNoteSchema),
  creditNotesController.cancel,
);

export { router as creditNotesRoutes };

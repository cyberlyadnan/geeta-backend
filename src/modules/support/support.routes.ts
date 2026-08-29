import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../validators/validate.js';
import { supportController } from './support.controller.js';
import {
  listMyTicketsQuerySchema,
  raiseComplaintSchema,
  raiseReprintSchema,
  rateTicketSchema,
  replySchema,
  reprintEligibilityQuerySchema,
  supportIdParamSchema,
  uploadTicketSchema,
} from './support.validation.js';

const router = Router();

// No role gate: these are the customer's own tickets, scoped to req.user at the query level.
// Staff raising a ticket on a vendor's behalf use the desk's own endpoints instead.
router.use(authenticate);

router.get('/settings', supportController.settings);
router.get(
  '/reprint/eligibility',
  validate(reprintEligibilityQuerySchema, 'query'),
  supportController.reprintEligibility,
);
router.get('/reprint/eligible-orders', supportController.reprintableOrders);
router.post('/reprint', validate(raiseReprintSchema), supportController.raiseReprint);
router.post('/complaints', validate(raiseComplaintSchema), supportController.raiseComplaint);

router.post('/attachments/upload-url', validate(uploadTicketSchema), supportController.requestUpload);

router.get('/tickets', validate(listMyTicketsQuerySchema, 'query'), supportController.listMine);
router.get('/tickets/:id', validate(supportIdParamSchema, 'params'), supportController.getTicket);
router.post(
  '/tickets/:id/reply',
  validate(supportIdParamSchema, 'params'),
  validate(replySchema),
  supportController.reply,
);
router.post(
  '/tickets/:id/rating',
  validate(supportIdParamSchema, 'params'),
  validate(rateTicketSchema),
  supportController.rate,
);

export { router as supportRoutes };

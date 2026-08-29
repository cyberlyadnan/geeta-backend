import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { SUPPORT_ADMIN_ROLES, SUPPORT_DECISION_ROLES, SUPPORT_DESK_ROLES } from '../../constants/roles.js';
import { adminSupportController } from './admin-support.controller.js';
import {
  approveReprintSchema,
  assignSchema,
  queueQuerySchema,
  raiseOnBehalfSchema,
  rejectSchema,
  resolveSchema,
  staffReplySchema,
  statsQuerySchema,
  supportSettingsSchema,
  ticketIdParamSchema,
  updateTicketSchema,
} from './admin-support.validation.js';

const router = Router();

router.use(authenticate);
/**
 * Gated by the shared SUPPORT_DESK_ROLES list rather than an inline array. When the standalone
 * support portal ships, its middleware reads the same constant — so a support operator gains
 * access to exactly these routes and nothing else, with no per-route audit.
 */
router.use(authorize(...SUPPORT_DESK_ROLES));

router.get('/tickets', validate(queueQuerySchema, 'query'), adminSupportController.queue);
router.post('/tickets', validate(raiseOnBehalfSchema), adminSupportController.raiseOnBehalf);
router.get('/agents', adminSupportController.agents);
router.get('/stats', validate(statsQuerySchema, 'query'), adminSupportController.stats);

router.get('/settings', adminSupportController.getSettings);
router.patch(
  '/settings',
  // Changing the reprint window changes what the business owes its customers — admin only.
  authorize(...SUPPORT_ADMIN_ROLES),
  validate(supportSettingsSchema),
  adminSupportController.updateSettings,
);

router.get('/tickets/:id', validate(ticketIdParamSchema, 'params'), adminSupportController.getTicket);
router.post(
  '/tickets/:id/reply',
  validate(ticketIdParamSchema, 'params'),
  validate(staffReplySchema),
  adminSupportController.reply,
);
router.patch(
  '/tickets/:id',
  validate(ticketIdParamSchema, 'params'),
  validate(updateTicketSchema),
  adminSupportController.update,
);
router.post(
  '/tickets/:id/assign',
  validate(ticketIdParamSchema, 'params'),
  validate(assignSchema),
  adminSupportController.assign,
);
router.post(
  '/tickets/:id/approve-reprint',
  authorize(...SUPPORT_DECISION_ROLES),
  validate(ticketIdParamSchema, 'params'),
  validate(approveReprintSchema),
  adminSupportController.approveReprint,
);
router.post(
  '/tickets/:id/reject',
  authorize(...SUPPORT_DECISION_ROLES),
  validate(ticketIdParamSchema, 'params'),
  validate(rejectSchema),
  adminSupportController.reject,
);
router.post(
  '/tickets/:id/resolve',
  validate(ticketIdParamSchema, 'params'),
  validate(resolveSchema),
  adminSupportController.resolve,
);
router.post('/tickets/:id/close', validate(ticketIdParamSchema, 'params'), adminSupportController.close);
router.post('/tickets/:id/reopen', validate(ticketIdParamSchema, 'params'), adminSupportController.reopen);

export { router as adminSupportRoutes };

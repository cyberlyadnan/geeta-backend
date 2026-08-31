import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { DELIVERY_ADMIN_ROLES, DELIVERY_DESK_ROLES } from '../../constants/roles.js';
import { adminDeliveryController } from './admin-delivery.controller.js';
import {
  agentIdParamSchema,
  assignSchema,
  assignmentIdParamSchema,
  cancelAssignmentSchema,
  createServiceSchema,
  listAgentsQuerySchema,
  listAssignmentsQuerySchema,
  listServicesQuerySchema,
  rerouteSchema,
  serviceIdParamSchema,
  setAgentServicesSchema,
  setVendorServicesSchema,
  statsQuerySchema,
  updateServiceSchema,
} from './admin-delivery.validation.js';

const router = Router();

router.use(authenticate);
/**
 * Gated by the shared DELIVERY_DESK_ROLES list rather than an inline array, so a dedicated
 * delivery-supervisor role later is one line in `constants/roles.ts` and not an audit of this
 * file. The service master is narrower still — see DELIVERY_ADMIN_ROLES below.
 */
router.use(authorize(...DELIVERY_DESK_ROLES));

// ── The service master ────────────────────────────────────────────────────────
router.get('/services', validate(listServicesQuerySchema, 'query'), adminDeliveryController.listServices);
router.post(
  '/services',
  // Creating a service changes how every future consignment is routed — admin only.
  authorize(...DELIVERY_ADMIN_ROLES),
  validate(createServiceSchema),
  adminDeliveryController.createService,
);
router.patch(
  '/services/:id',
  authorize(...DELIVERY_ADMIN_ROLES),
  validate(serviceIdParamSchema, 'params'),
  validate(updateServiceSchema),
  adminDeliveryController.updateService,
);

// ── Delivery people ───────────────────────────────────────────────────────────
router.get('/agents', validate(listAgentsQuerySchema, 'query'), adminDeliveryController.listAgents);
router.put(
  '/agents/:id/services',
  authorize(...DELIVERY_ADMIN_ROLES),
  validate(agentIdParamSchema, 'params'),
  validate(setAgentServicesSchema),
  adminDeliveryController.setAgentServices,
);

// ── Vendor tagging (id is the vendor PROFILE id, matching the admin vendor screens) ──
router.get(
  '/vendors/:id/services',
  validate(agentIdParamSchema, 'params'),
  adminDeliveryController.getVendorServices,
);
router.put(
  '/vendors/:id/services',
  validate(agentIdParamSchema, 'params'),
  validate(setVendorServicesSchema),
  adminDeliveryController.setVendorServices,
);

// ── The board ─────────────────────────────────────────────────────────────────
router.get('/stats', validate(statsQuerySchema, 'query'), adminDeliveryController.stats);
router.get('/unrouted', adminDeliveryController.listUnrouted);
router.post(
  '/unrouted',
  validate(z.object({ batchId: z.string().cuid(), deliveryServiceId: z.string().cuid() })),
  adminDeliveryController.routeUnrouted,
);
router.get(
  '/assignments',
  validate(listAssignmentsQuerySchema, 'query'),
  adminDeliveryController.listAssignments,
);
router.get(
  '/assignments/:id',
  validate(assignmentIdParamSchema, 'params'),
  adminDeliveryController.getAssignment,
);
router.post(
  '/assignments/:id/assign',
  validate(assignmentIdParamSchema, 'params'),
  validate(assignSchema),
  adminDeliveryController.assign,
);
router.post(
  '/assignments/:id/reroute',
  validate(assignmentIdParamSchema, 'params'),
  validate(rerouteSchema),
  adminDeliveryController.reroute,
);
router.post(
  '/assignments/:id/cancel',
  validate(assignmentIdParamSchema, 'params'),
  validate(cancelAssignmentSchema),
  adminDeliveryController.cancel,
);

export { router as adminDeliveryDepartmentRoutes };

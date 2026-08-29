import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../validators/validate.js';
import { channelPartnerController } from './channel-partner.controller.js';
import {
  partnerOverviewQuerySchema,
  partnerVendorListQuerySchema,
} from './channel-partner.validation.js';

const router = Router();

/**
 * Authenticated but not role-gated: "channel partner" is a profile on a vendor account, not a
 * role. Authorisation happens inside the service, where `requireContext` resolves the exact set of
 * vendors the caller may see — a user with no partner profile is refused there, and one with a
 * profile can only ever reach the vendors on their own list.
 *
 * Three endpoints, all GET. There are no POST, PATCH or DELETE routes here at all: the partner
 * panel is read-only by construction, not by permission.
 *
 * Note what is *not* here. There is no per-vendor order list, order detail or invoice endpoint,
 * because a partner does not read a reduced copy of their vendor's data — they open the vendor's
 * own portal, and the vendor's own endpoints answer, as that vendor, for reads only. See
 * `middleware/partner-view.ts`. One way to read a vendor's orders, not two that can drift apart.
 */
router.use(authenticate);

router.get('/me', channelPartnerController.me);
router.get(
  '/overview',
  validate(partnerOverviewQuerySchema, 'query'),
  channelPartnerController.overview,
);
router.get(
  '/vendors',
  validate(partnerVendorListQuerySchema, 'query'),
  channelPartnerController.vendors,
);

export { router as channelPartnerRoutes };

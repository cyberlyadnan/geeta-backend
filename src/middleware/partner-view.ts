import type { Request } from 'express';
import { ChannelPartnerStatus, RoleName } from '@prisma/client';
import { prisma } from '../config/database.js';
import { ApiError } from '../common/errors/ApiError.js';
import { decidePartnerView } from './partner-view-rules.js';

/**
 * The header a channel partner sends to look at one of their vendors' screens.
 *
 * Lower-case because Node normalises incoming header names; the browser sends `X-Partner-View`.
 */
export const PARTNER_VIEW_HEADER = 'x-partner-view';

/**
 * "View as vendor" — the one place in the system where a request runs as somebody else.
 *
 * A channel partner asked for their vendors' screens rather than a reduced summary of them, and
 * the honest way to give them that is to let the vendor's own endpoints answer, as that vendor.
 * Which makes this function the highest-risk code in the codebase, so it is written to fail shut
 * on every axis at once:
 *
 *  1. **Reads only.** Anything other than GET/HEAD is refused here, before any route sees it. Not
 *     a list of protected mutations that someone must remember to extend — the default is no.
 *  2. **Never on auth or upload-authorisation paths**, whatever the method.
 *  3. **The link is re-checked on every single request**, not cached and not trusted from a token.
 *     Suspending a partner or ending an assignment takes effect on their very next request.
 *  4. **Refusals are 404, never 403**, so a partner cannot discover which vendor ids exist by
 *     probing the header.
 *  5. **The swap happens inside `authenticate`**, before the request context is preloaded — so
 *     `req.authContext`, the vendor profile id used for observability, and every downstream
 *     `req.user.id` describe one identity consistently. There is no window in which half the
 *     request is the partner and half is the vendor.
 *
 * `req.partnerView` keeps the real actor's id, so logs and any future audit trail can say who was
 * actually holding the keyboard.
 */
export async function applyPartnerViewContext(req: Request): Promise<void> {
  const raw = req.headers[PARTNER_VIEW_HEADER];
  const vendorUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!req.user) return;

  const decision = decidePartnerView({
    hasHeader: Boolean(vendorUserId),
    method: req.method,
    url: req.originalUrl,
  });

  if (decision.kind === 'ignore') return;
  if (decision.kind === 'refuse') {
    throw ApiError.forbidden(
      decision.reason === 'method'
        ? 'You are viewing this vendor read-only. Changes cannot be made on their behalf.'
        : 'This is not available while viewing a vendor.',
    );
  }

  const actorUserId = req.user.id;

  // One query, both checks: the partner must be ACTIVE and the assignment must still be live.
  const assignment = await prisma.channelPartnerAssignment.findFirst({
    where: {
      vendorUserId,
      isActive: true,
      partnerProfile: { userId: actorUserId, status: ChannelPartnerStatus.ACTIVE },
    },
    select: {
      vendorUser: { select: { id: true, email: true, role: { select: { name: true } } } },
    },
  });

  // Deliberately "not found" rather than "forbidden" — see the note above.
  if (!assignment?.vendorUser) throw ApiError.notFound('Vendor not found');
  if (assignment.vendorUser.role.name !== RoleName.VENDOR) {
    throw ApiError.notFound('Vendor not found');
  }

  req.partnerView = { actorUserId, vendorUserId: assignment.vendorUser.id };
  req.user = {
    id: assignment.vendorUser.id,
    email: assignment.vendorUser.email,
    role: RoleName.VENDOR,
    // No permissions are carried over. A partner viewing a vendor holds exactly the rights of a
    // plain vendor doing a GET, and never their own admin-ish extras.
    permissions: [],
  };
}

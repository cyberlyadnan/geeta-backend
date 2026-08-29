import { ChannelPartnerStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { assertVendorInScope } from './partner-scope.js';

export interface PartnerContext {
  partnerProfileId: string;
  partnerUserId: string;
  partnerCode: string;
  status: ChannelPartnerStatus;
  /** User ids of every vendor currently linked to this partner. */
  linkedVendorIds: string[];
}

/**
 * The gate every partner-facing read passes through.
 *
 * A channel partner is a vendor with a second hat, which makes this the single most dangerous
 * surface in the feature: get the scoping wrong and one vendor reads another vendor's order book.
 * So the rule is enforced in one place and expressed as data, not as a permission flag —
 * `requireContext` resolves the exact set of vendor ids this partner may see, and every query in
 * the partner module filters on that set. There is no partner endpoint that takes a vendor id
 * without first proving it is inside this list.
 *
 * Suspending a partner empties the gate rather than deleting the links, so access stops instantly
 * and the history survives.
 */
export class PartnerAccessService {
  async requireContext(userId: string): Promise<PartnerContext> {
    const profile = await prisma.channelPartnerProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        partnerCode: true,
        status: true,
        assignments: { where: { isActive: true }, select: { vendorUserId: true } },
      },
    });

    if (!profile) {
      throw ApiError.forbidden('This account is not set up as a channel partner');
    }
    if (profile.status !== ChannelPartnerStatus.ACTIVE) {
      throw ApiError.forbidden('Your partner account is currently on hold. Please contact us.');
    }

    return {
      partnerProfileId: profile.id,
      partnerUserId: profile.userId,
      partnerCode: profile.partnerCode,
      status: profile.status,
      linkedVendorIds: profile.assignments.map((assignment) => assignment.vendorUserId),
    };
  }

  /** Non-throwing check for the vendor portal's "do I have a partner panel?" header probe. */
  async describe(userId: string): Promise<{
    isPartner: boolean;
    status: ChannelPartnerStatus | null;
    partnerCode: string | null;
    linkedVendorCount: number;
  }> {
    const profile = await prisma.channelPartnerProfile.findUnique({
      where: { userId },
      select: {
        partnerCode: true,
        status: true,
        _count: { select: { assignments: { where: { isActive: true } } } },
      },
    });

    if (!profile) {
      return { isPartner: false, status: null, partnerCode: null, linkedVendorCount: 0 };
    }
    return {
      isPartner: true,
      status: profile.status,
      partnerCode: profile.partnerCode,
      linkedVendorCount: profile._count.assignments,
    };
  }

  /**
   * Confirms one vendor is inside the partner's set before any per-vendor query runs.
   *
   * Returns "not found" rather than "forbidden" on a miss: a partner probing vendor ids should
   * learn nothing about which ones exist.
   */
  assertLinked(context: PartnerContext, vendorUserId: string): void {
    assertVendorInScope(context.linkedVendorIds, vendorUserId);
  }
}

export const partnerAccessService = new PartnerAccessService();

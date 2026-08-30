import { ChannelPartnerStatus, Prisma, RoleName } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { formatVendorCodeDisplay, vendorCodeSearchTerms } from '../../constants/vendor-code.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { logger } from '../../logs/logger.js';
import { allocatePartnerCode, partnerStatsService } from '../../services/channel-partner/index.js';
import { notifyUser } from '../orders/order-events.service.js';
import type {
  AssignVendorsInput,
  AssignableVendorsQuery,
  CommissionPlanInput,
  ListPartnersQuery,
  PartnerStatsQuery,
  PromoteVendorInput,
  UnassignVendorInput,
  UpdatePartnerInput,
} from './admin-channel-partners.validation.js';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: Prisma.Decimal | null | undefined): number => (value == null ? 0 : Number(value));

/**
 * Admin management of channel partners.
 *
 * The operation that matters is `assignVendors`, and the thing to understand about it is that a
 * vendor belongs to at most one partner at a time. Two partners both claiming to have introduced
 * the same shop is a real and recurring situation, and letting both link to them would double-count
 * revenue in every report and — once commission exists — pay twice for one introduction. So the
 * service refuses the second claim and names the partner who already holds it, which turns a silent
 * data problem into a conversation the admin can have.
 */
export class AdminChannelPartnersService {
  async list(query: ListPartnersQuery) {
    const where: Prisma.ChannelPartnerProfileWhereInput = {
      ...(query.status && { status: query.status }),
      ...((query.from ?? query.to) && {
        promotedAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...(query.search && {
        OR: [
          { partnerCode: { contains: query.search, mode: 'insensitive' as const } },
          { displayName: { contains: query.search, mode: 'insensitive' as const } },
          { user: { vendorProfile: { businessName: { contains: query.search, mode: 'insensitive' as const } } } },
          { user: { phone: { contains: query.search } } },
        ],
      }),
    };

    const [partners, total] = await Promise.all([
      prisma.channelPartnerProfile.findMany({
        where,
        orderBy: { promotedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              vendorProfile: { select: { businessName: true, vendorCode: true, city: true } },
            },
          },
          _count: { select: { assignments: { where: { isActive: true } } } },
        },
      }),
      prisma.channelPartnerProfile.count({ where }),
    ]);

    // One aggregate across every partner's network rather than a query per partner.
    const allLinks = await prisma.channelPartnerAssignment.findMany({
      where: { partnerProfileId: { in: partners.map((partner) => partner.id) }, isActive: true },
      select: { partnerProfileId: true, vendorUserId: true },
    });
    const vendorsByPartner = new Map<string, string[]>();
    for (const link of allLinks) {
      vendorsByPartner.set(link.partnerProfileId, [
        ...(vendorsByPartner.get(link.partnerProfileId) ?? []),
        link.vendorUserId,
      ]);
    }

    const revenueByVendor = allLinks.length
      ? await prisma.productionOrder.groupBy({
          by: ['customerId'],
          where: {
            customerId: { in: allLinks.map((link) => link.vendorUserId) },
            status: { notIn: ['DRAFT', 'CANCELLED'] },
            ...((query.from ?? query.to) && {
              createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
            }),
          },
          _sum: { totalAmount: true },
          _count: { _all: true },
        })
      : [];
    const revenueMap = new Map(
      revenueByVendor.map((row) => [row.customerId, { value: num(row._sum.totalAmount), orders: row._count._all }]),
    );

    return {
      data: partners.map((partner) => {
        const vendorIds = vendorsByPartner.get(partner.id) ?? [];
        const totals = vendorIds.reduce(
          (acc, vendorId) => {
            const stats = revenueMap.get(vendorId);
            return {
              revenue: acc.revenue + (stats?.value ?? 0),
              orders: acc.orders + (stats?.orders ?? 0),
            };
          },
          { revenue: 0, orders: 0 },
        );

        return {
          id: partner.id,
          partnerCode: partner.partnerCode,
          status: partner.status,
          displayName:
            partner.displayName ??
            partner.user.vendorProfile?.businessName ??
            `${partner.user.firstName} ${partner.user.lastName}`,
          userId: partner.user.id,
          vendorCode: formatVendorCodeDisplay(partner.user.vendorProfile?.vendorCode),
          city: partner.user.vendorProfile?.city ?? null,
          phone: partner.user.phone,
          email: partner.user.email,
          linkedVendorCount: partner._count.assignments,
          networkRevenue: round2(totals.revenue),
          networkOrders: totals.orders,
          promotedAt: partner.promotedAt.toISOString(),
        };
      }),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  async promote(input: PromoteVendorInput, adminUserId: string) {
    const vendor = await prisma.user.findUnique({
      where: { id: input.vendorUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: { select: { name: true } },
        vendorProfile: { select: { businessName: true } },
        channelPartnerProfile: { select: { id: true } },
      },
    });

    if (!vendor) throw ApiError.notFound('Vendor not found');
    if (vendor.role.name !== RoleName.VENDOR) {
      throw ApiError.badRequest('Only a vendor account can become a channel partner');
    }
    if (vendor.channelPartnerProfile) {
      throw ApiError.badRequest('This vendor is already a channel partner');
    }

    const businessName = vendor.vendorProfile?.businessName ?? `${vendor.firstName} ${vendor.lastName}`;

    const profile = await prisma.$transaction(async (tx) => {
      const partnerCode = await allocatePartnerCode(tx, businessName);
      return tx.channelPartnerProfile.create({
        data: {
          userId: vendor.id,
          partnerCode,
          displayName: input.displayName?.trim() ?? null,
          notes: input.notes?.trim() ?? null,
          promotedById: adminUserId,
          status: ChannelPartnerStatus.ACTIVE,
        },
      });
    });

    await notifyUser(vendor.id, {
      type: 'CHANNEL_PARTNER_ACTIVATED',
      title: 'Your partner panel is ready',
      body: `You can now track the vendors you refer. Your referral code is ${profile.partnerCode}.`,
      entityType: 'channel_partner',
      entityId: profile.id,
    });

    logger.info('Vendor promoted to channel partner', {
      vendorUserId: vendor.id,
      partnerCode: profile.partnerCode,
    });

    return this.detail(profile.id, {});
  }

  async update(partnerId: string, input: UpdatePartnerInput) {
    const partner = await prisma.channelPartnerProfile.findUnique({ where: { id: partnerId } });
    if (!partner) throw ApiError.notFound('Partner not found');

    await prisma.channelPartnerProfile.update({
      where: { id: partnerId },
      data: {
        ...(input.status && { status: input.status }),
        ...(input.displayName !== undefined && { displayName: input.displayName }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });

    return this.detail(partnerId, {});
  }

  /**
   * Links vendors to a partner.
   *
   * Re-activates a previously ended link rather than creating a duplicate, so a vendor who moves
   * away and comes back keeps one continuous history row instead of two competing ones.
   */
  async assignVendors(partnerId: string, input: AssignVendorsInput, adminUserId: string) {
    const partner = await prisma.channelPartnerProfile.findUnique({
      where: { id: partnerId },
      select: { id: true, userId: true, partnerCode: true },
    });
    if (!partner) throw ApiError.notFound('Partner not found');

    if (input.vendorUserIds.includes(partner.userId)) {
      throw ApiError.badRequest('A partner cannot be assigned to themselves');
    }

    // Anyone already spoken for by a different partner — refuse the whole batch and say who.
    const conflicts = await prisma.channelPartnerAssignment.findMany({
      where: {
        vendorUserId: { in: input.vendorUserIds },
        isActive: true,
        partnerProfileId: { not: partnerId },
      },
      select: {
        vendorUserId: true,
        partnerProfile: { select: { partnerCode: true, user: { select: { vendorProfile: { select: { businessName: true } } } } } },
        vendorUser: { select: { vendorProfile: { select: { businessName: true } } } },
      },
    });

    if (conflicts.length > 0) {
      const names = conflicts
        .map(
          (conflict) =>
            `${conflict.vendorUser.vendorProfile?.businessName ?? 'a vendor'} (already with ${
              conflict.partnerProfile.user.vendorProfile?.businessName ?? conflict.partnerProfile.partnerCode
            })`,
        )
        .join(', ');
      throw ApiError.badRequest(
        `These vendors are already linked to another partner: ${names}. End that link first if the vendor has moved.`,
      );
    }

    const validVendors = await prisma.user.findMany({
      where: { id: { in: input.vendorUserIds }, role: { name: RoleName.VENDOR } },
      select: { id: true },
    });
    const validIds = new Set(validVendors.map((vendor) => vendor.id));
    const rejected = input.vendorUserIds.filter((id) => !validIds.has(id));
    if (rejected.length > 0) {
      throw ApiError.badRequest('One or more of the selected accounts is not a vendor');
    }

    await prisma.$transaction(async (tx) => {
      for (const vendorUserId of input.vendorUserIds) {
        await tx.channelPartnerAssignment.upsert({
          where: { partnerProfileId_vendorUserId: { partnerProfileId: partnerId, vendorUserId } },
          create: {
            partnerProfileId: partnerId,
            vendorUserId,
            source: input.source,
            assignedById: adminUserId,
            notes: input.notes?.trim() ?? null,
          },
          update: {
            isActive: true,
            assignedById: adminUserId,
            assignedAt: new Date(),
            endedAt: null,
            endedById: null,
            source: input.source,
            notes: input.notes?.trim() ?? null,
          },
        });
      }
    });

    await notifyUser(partner.userId, {
      type: 'CHANNEL_PARTNER_VENDORS_ASSIGNED',
      title: `${String(input.vendorUserIds.length)} vendor(s) added to your network`,
      body: 'Open your partner panel to see their orders and purchases.',
      entityType: 'channel_partner',
      entityId: partner.id,
    });

    return this.detail(partnerId, {});
  }

  async unassignVendor(
    partnerId: string,
    vendorUserId: string,
    input: UnassignVendorInput,
    adminUserId: string,
  ) {
    const assignment = await prisma.channelPartnerAssignment.findUnique({
      where: { partnerProfileId_vendorUserId: { partnerProfileId: partnerId, vendorUserId } },
    });
    if (!assignment || !assignment.isActive) {
      throw ApiError.notFound('That vendor is not currently linked to this partner');
    }

    // Ended, never deleted: a report over a past quarter still needs to know who held this vendor
    // at the time.
    await prisma.channelPartnerAssignment.update({
      where: { id: assignment.id },
      data: {
        isActive: false,
        endedAt: new Date(),
        endedById: adminUserId,
        notes: input.reason?.trim() ?? assignment.notes,
      },
    });

    return this.detail(partnerId, {});
  }

  async detail(partnerId: string, query: PartnerStatsQuery) {
    const partner = await prisma.channelPartnerProfile.findUnique({
      where: { id: partnerId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            createdAt: true,
            vendorProfile: {
              select: { businessName: true, vendorCode: true, city: true, state: true, gstNumber: true },
            },
          },
        },
        promotedBy: { select: { firstName: true, lastName: true } },
        assignments: {
          orderBy: [{ isActive: 'desc' }, { assignedAt: 'desc' }],
          include: {
            vendorUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                vendorProfile: { select: { businessName: true, vendorCode: true, city: true } },
              },
            },
            assignedBy: { select: { firstName: true, lastName: true } },
          },
        },
        commissionPlans: { orderBy: { effectiveFrom: 'desc' } },
      },
    });

    if (!partner) throw ApiError.notFound('Partner not found');

    const activeVendorIds = partner.assignments
      .filter((assignment) => assignment.isActive)
      .map((assignment) => assignment.vendorUserId);

    const [summary, breakdown, commission] = await Promise.all([
      partnerStatsService.networkSummary(activeVendorIds, query),
      partnerStatsService.vendorBreakdown(activeVendorIds, query),
      partnerStatsService.commissionEstimate(partner.id, activeVendorIds, query),
    ]);

    return {
      id: partner.id,
      partnerCode: partner.partnerCode,
      status: partner.status,
      displayName:
        partner.displayName ??
        partner.user.vendorProfile?.businessName ??
        `${partner.user.firstName} ${partner.user.lastName}`,
      notes: partner.notes,
      promotedAt: partner.promotedAt.toISOString(),
      promotedByName: partner.promotedBy
        ? `${partner.promotedBy.firstName} ${partner.promotedBy.lastName}`
        : null,
      user: {
        id: partner.user.id,
        name: partner.user.vendorProfile?.businessName ?? `${partner.user.firstName} ${partner.user.lastName}`,
        vendorCode: formatVendorCodeDisplay(partner.user.vendorProfile?.vendorCode),
        email: partner.user.email,
        phone: partner.user.phone,
        city: partner.user.vendorProfile?.city ?? null,
        state: partner.user.vendorProfile?.state ?? null,
        gstNumber: partner.user.vendorProfile?.gstNumber ?? null,
        memberSince: partner.user.createdAt.toISOString(),
      },
      network: summary,
      vendors: breakdown,
      assignments: partner.assignments.map((assignment) => ({
        id: assignment.id,
        vendorUserId: assignment.vendorUserId,
        vendorName:
          assignment.vendorUser.vendorProfile?.businessName ??
          `${assignment.vendorUser.firstName} ${assignment.vendorUser.lastName}`,
        vendorCode: formatVendorCodeDisplay(assignment.vendorUser.vendorProfile?.vendorCode),
        city: assignment.vendorUser.vendorProfile?.city ?? null,
        phone: assignment.vendorUser.phone,
        source: assignment.source,
        isActive: assignment.isActive,
        assignedAt: assignment.assignedAt.toISOString(),
        assignedByName: assignment.assignedBy
          ? `${assignment.assignedBy.firstName} ${assignment.assignedBy.lastName}`
          : null,
        endedAt: assignment.endedAt?.toISOString() ?? null,
        notes: assignment.notes,
      })),
      commissionEstimate: commission,
      commissionPlans: partner.commissionPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        basis: plan.basis,
        ratePercent: num(plan.ratePercent),
        minOrderValue: num(plan.minOrderValue),
        monthlyCap: num(plan.monthlyCap),
        status: plan.status,
        effectiveFrom: plan.effectiveFrom.toISOString(),
        effectiveTo: plan.effectiveTo?.toISOString() ?? null,
        notes: plan.notes,
      })),
    };
  }

  /** Vendors an admin can pick from when adding to a partner's network. */
  async assignableVendors(partnerId: string, query: AssignableVendorsQuery) {
    const partner = await prisma.channelPartnerProfile.findUnique({
      where: { id: partnerId },
      select: { userId: true },
    });
    if (!partner) throw ApiError.notFound('Partner not found');

    const linkedAnywhere = query.unlinkedOnly
      ? await prisma.channelPartnerAssignment.findMany({
          where: { isActive: true },
          select: { vendorUserId: true },
        })
      : [];

    const vendors = await prisma.user.findMany({
      where: {
        role: { name: RoleName.VENDOR },
        deletedAt: null,
        id: {
          notIn: [partner.userId, ...linkedAnywhere.map((link) => link.vendorUserId)],
        },
        ...(query.search && {
          OR: [
            { vendorProfile: { businessName: { contains: query.search, mode: 'insensitive' as const } } },
            ...vendorCodeSearchTerms(query.search).map((term) => ({
              vendorProfile: { vendorCode: { contains: term, mode: 'insensitive' as const } },
            })),
            { phone: { contains: query.search } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }),
      },
      take: query.limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        createdAt: true,
        vendorProfile: { select: { businessName: true, vendorCode: true, city: true, accountStatus: true } },
      },
    });

    return vendors.map((vendor) => ({
      id: vendor.id,
      name: vendor.vendorProfile?.businessName ?? `${vendor.firstName} ${vendor.lastName}`,
      vendorCode: formatVendorCodeDisplay(vendor.vendorProfile?.vendorCode),
      city: vendor.vendorProfile?.city ?? null,
      phone: vendor.phone,
      accountStatus: vendor.vendorProfile?.accountStatus ?? null,
      registeredAt: vendor.createdAt.toISOString(),
    }));
  }

  // ── Commission plans (configured now, paid later) ─────────────────────────

  async createCommissionPlan(partnerId: string, input: CommissionPlanInput, adminUserId: string) {
    const partner = await prisma.channelPartnerProfile.findUnique({ where: { id: partnerId } });
    if (!partner) throw ApiError.notFound('Partner not found');

    // Only one plan can be live at a time — overlapping active plans would make the estimate
    // meaningless and, once commission is real, the payout ambiguous.
    if (input.status === 'ACTIVE') {
      await prisma.channelPartnerCommissionPlan.updateMany({
        where: { partnerProfileId: partnerId, status: 'ACTIVE' },
        data: { status: 'ARCHIVED', effectiveTo: new Date() },
      });
    }

    await prisma.channelPartnerCommissionPlan.create({
      data: {
        partnerProfileId: partnerId,
        name: input.name.trim(),
        basis: input.basis,
        ratePercent: new Prisma.Decimal(input.ratePercent),
        minOrderValue: new Prisma.Decimal(input.minOrderValue),
        monthlyCap: new Prisma.Decimal(input.monthlyCap),
        status: input.status,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        notes: input.notes?.trim() ?? null,
        createdById: adminUserId,
      },
    });

    return this.detail(partnerId, {});
  }

  /** Business generated through partners overall — the "is this programme working" number. */
  async programmeStats(query: PartnerStatsQuery) {
    const [partners, links] = await Promise.all([
      prisma.channelPartnerProfile.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.channelPartnerAssignment.findMany({
        where: { isActive: true },
        select: { vendorUserId: true },
      }),
    ]);

    const vendorIds = links.map((link) => link.vendorUserId);
    const summary = await partnerStatsService.networkSummary(vendorIds, query);

    const [allVendorRevenue, partnerVendorCount] = await Promise.all([
      prisma.productionOrder.aggregate({
        where: {
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          customerId: { not: null },
          ...((query.from ?? query.to) && {
            createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
          }),
        },
        _sum: { totalAmount: true },
      }),
      prisma.user.count({ where: { role: { name: RoleName.VENDOR }, deletedAt: null } }),
    ]);

    const platformRevenue = round2(num(allVendorRevenue._sum.totalAmount));

    return {
      partners: {
        total: partners.reduce((sum, row) => sum + row._count._all, 0),
        active: partners.find((row) => row.status === 'ACTIVE')?._count._all ?? 0,
        suspended: partners.find((row) => row.status === 'SUSPENDED')?._count._all ?? 0,
      },
      coverage: {
        linkedVendors: vendorIds.length,
        totalVendors: partnerVendorCount,
        coveragePercent:
          partnerVendorCount === 0 ? 0 : round2((vendorIds.length / partnerVendorCount) * 100),
      },
      revenue: {
        throughPartners: summary.totals.totalPurchase,
        platformTotal: platformRevenue,
        sharePercent:
          platformRevenue === 0 ? 0 : round2((summary.totals.totalPurchase / platformRevenue) * 100),
        orderCount: summary.totals.orderCount,
      },
      trend: summary.trend,
    };
  }
}

export const adminChannelPartnersService = new AdminChannelPartnersService();

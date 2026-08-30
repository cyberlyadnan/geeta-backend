import { ProductionOrderStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { vendorCodeSearchTerms } from '../../constants/vendor-code.js';
import { partnerAccessService, partnerStatsService } from '../../services/channel-partner/index.js';
import type {
  PartnerOverviewQuery,
  PartnerVendorListQuery,
} from './channel-partner.validation.js';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: Prisma.Decimal | null | undefined): number => (value == null ? 0 : Number(value));

/**
 * The channel partner's read-only window onto the vendors they brought in.
 *
 * Two rules hold this together, and both are enforced structurally rather than by convention:
 *
 *  1. **Scope before query.** Every method calls `requireContext` first and filters on the vendor
 *     ids it returns. A partner cannot reach a vendor who is not linked to them, and cannot reach
 *     one whose link has been ended, because the id simply is not in the list.
 *  2. **Read only, by absence.** There is no create, update or delete method on this service at
 *     all — not a permission check that could be bypassed, but nothing to bypass. A partner
 *     cannot place an order, raise a complaint, top up a wallet or amend anything for a linked
 *     vendor, because this module offers no verb that does so.
 *
 * What a partner *can* do is see everything the vendor sees: orders and their live production
 * stage, invoices and their PDFs, purchase totals and reports. That visibility is the point of the
 * arrangement — the partner vouched for the platform and needs to see it working.
 */
export class ChannelPartnerService {
  /** Header probe: does this user get the partner-panel switcher at all? */
  async describe(userId: string) {
    return partnerAccessService.describe(userId);
  }

  async overview(userId: string, query: PartnerOverviewQuery) {
    const context = await partnerAccessService.requireContext(userId);
    const [summary, commission, profile, recentOrders] = await Promise.all([
      partnerStatsService.networkSummary(context.linkedVendorIds, query),
      partnerStatsService.commissionEstimate(context.partnerProfileId, context.linkedVendorIds, query),
      prisma.channelPartnerProfile.findUnique({
        where: { id: context.partnerProfileId },
        select: { partnerCode: true, displayName: true, promotedAt: true },
      }),
      context.linkedVendorIds.length > 0
        ? prisma.productionOrder.findMany({
            where: {
              customerId: { in: context.linkedVendorIds },
              status: { notIn: [ProductionOrderStatus.DRAFT] },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              orderNumber: true,
              orderName: true,
              status: true,
              totalAmount: true,
              createdAt: true,
              isReprint: true,
              customerId: true,
              customer: {
                select: { firstName: true, lastName: true, vendorProfile: { select: { businessName: true } } },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    return {
      partner: {
        partnerCode: profile?.partnerCode ?? context.partnerCode,
        displayName: profile?.displayName ?? null,
        partnerSince: profile?.promotedAt.toISOString() ?? null,
      },
      ...summary,
      commissionEstimate: commission,
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        orderName: order.orderName,
        status: order.status,
        totalAmount: num(order.totalAmount),
        isReprint: order.isReprint,
        createdAt: order.createdAt.toISOString(),
        vendorUserId: order.customerId,
        vendorName:
          order.customer?.vendorProfile?.businessName ??
          `${order.customer?.firstName ?? ''} ${order.customer?.lastName ?? ''}`.trim(),
      })),
    };
  }

  async listVendors(userId: string, query: PartnerVendorListQuery) {
    const context = await partnerAccessService.requireContext(userId);
    const rows = await partnerStatsService.vendorBreakdown(context.linkedVendorIds, query);

    const needle = query.search?.toLowerCase();
    const codeTerms = query.search ? vendorCodeSearchTerms(query.search).map((t) => t.toLowerCase()) : [];
    const filtered = needle
      ? rows.filter(
          (row) =>
            row.vendorName.toLowerCase().includes(needle) ||
            codeTerms.some((term) => (row.vendorCode ?? '').toLowerCase().includes(term)) ||
            (row.city ?? '').toLowerCase().includes(needle),
        )
      : rows;

    const sorted = [...filtered].sort((a, b) => {
      switch (query.sort) {
        case 'orders':
          return b.orderCount - a.orderCount;
        case 'name':
          return a.vendorName.localeCompare(b.vendorName);
        case 'recent':
          return (b.lastOrderAt ?? '').localeCompare(a.lastOrderAt ?? '');
        default:
          return b.totalPurchase - a.totalPurchase;
      }
    });

    return {
      data: sorted,
      totals: {
        vendorCount: sorted.length,
        totalPurchase: round2(sorted.reduce((sum, row) => sum + row.totalPurchase, 0)),
        orderCount: sorted.reduce((sum, row) => sum + row.orderCount, 0),
      },
    };
  }
}

export const channelPartnerService = new ChannelPartnerService();

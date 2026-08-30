import { CommissionPlanStatus, Prisma, ProductionOrderStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { formatVendorCodeDisplay } from '../../constants/vendor-code.js';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: Prisma.Decimal | null | undefined): number => (value == null ? 0 : Number(value));

/** Orders that never became revenue — excluded from every partner figure. */
const NON_BILLABLE: ProductionOrderStatus[] = [ProductionOrderStatus.DRAFT, ProductionOrderStatus.CANCELLED];

export interface PartnerVendorStat {
  vendorUserId: string;
  vendorName: string;
  vendorCode: string | null;
  city: string | null;
  phone: string | null;
  accountStatus: string;
  linkedAt: string;
  orderCount: number;
  totalPurchase: number;
  lastOrderAt: string | null;
  walletBalance: number;
  openOrders: number;
}

/**
 * The numbers behind a channel partner — both the partner's own view of the vendors they brought
 * in, and the admin's view of what that partner is worth to the business.
 *
 * Every figure is computed from the same order and wallet tables the vendor's own reports read, so
 * a partner and their vendor comparing screens see identical numbers. That matters more than it
 * sounds: the relationship this feature exists to support is one where the partner vouches for the
 * platform to people who trust him.
 *
 * **Commission is indicative only.** `commissionEstimate` applies the partner's active plan to the
 * period's revenue so the business can see what a commission arrangement *would* cost before
 * committing to one. Nothing accrues, nothing is owed, and nothing is posted to the books — see
 * the note on ChannelPartnerCommissionPlan for how a real commission phase plugs in.
 */
export class PartnerStatsService {
  /** Per-vendor rollup for the partner's dashboard. */
  async vendorBreakdown(
    vendorIds: string[],
    range: { from?: Date; to?: Date } = {},
  ): Promise<PartnerVendorStat[]> {
    if (vendorIds.length === 0) return [];

    const dateFilter =
      range.from ?? range.to
        ? { createdAt: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } }
        : {};

    const [vendors, orderStats, lastOrders, wallets, openCounts, assignments] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: vendorIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          vendorProfile: {
            select: { businessName: true, vendorCode: true, city: true, accountStatus: true },
          },
        },
      }),
      prisma.productionOrder.groupBy({
        by: ['customerId'],
        where: { customerId: { in: vendorIds }, status: { notIn: NON_BILLABLE }, ...dateFilter },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      prisma.productionOrder.groupBy({
        by: ['customerId'],
        where: { customerId: { in: vendorIds }, status: { notIn: NON_BILLABLE } },
        _max: { createdAt: true },
      }),
      prisma.wallet.findMany({
        where: { userId: { in: vendorIds } },
        select: { userId: true, currentBalance: true },
      }),
      prisma.productionOrder.groupBy({
        by: ['customerId'],
        where: {
          customerId: { in: vendorIds },
          status: {
            notIn: [
              ProductionOrderStatus.DRAFT,
              ProductionOrderStatus.CANCELLED,
              ProductionOrderStatus.DELIVERED,
              ProductionOrderStatus.COMPLETED,
            ],
          },
        },
        _count: { _all: true },
      }),
      prisma.channelPartnerAssignment.findMany({
        where: { vendorUserId: { in: vendorIds }, isActive: true },
        select: { vendorUserId: true, assignedAt: true },
      }),
    ]);

    const statsById = new Map(orderStats.map((row) => [row.customerId, row]));
    const lastById = new Map(lastOrders.map((row) => [row.customerId, row._max.createdAt]));
    const walletById = new Map(wallets.map((row) => [row.userId, row.currentBalance]));
    const openById = new Map(openCounts.map((row) => [row.customerId, row._count._all]));
    const linkedById = new Map(assignments.map((row) => [row.vendorUserId, row.assignedAt]));

    return vendors
      .map((vendor) => {
        const stats = statsById.get(vendor.id);
        return {
          vendorUserId: vendor.id,
          vendorName: vendor.vendorProfile?.businessName ?? `${vendor.firstName} ${vendor.lastName}`,
          vendorCode: formatVendorCodeDisplay(vendor.vendorProfile?.vendorCode),
          city: vendor.vendorProfile?.city ?? null,
          phone: vendor.phone,
          accountStatus: vendor.vendorProfile?.accountStatus ?? 'UNKNOWN',
          linkedAt: (linkedById.get(vendor.id) ?? new Date()).toISOString(),
          orderCount: stats?._count._all ?? 0,
          totalPurchase: round2(num(stats?._sum.totalAmount)),
          lastOrderAt: lastById.get(vendor.id)?.toISOString() ?? null,
          walletBalance: round2(num(walletById.get(vendor.id))),
          openOrders: openById.get(vendor.id) ?? 0,
        };
      })
      .sort((a, b) => b.totalPurchase - a.totalPurchase);
  }

  /** Headline totals plus a month-by-month trend across the whole linked network. */
  async networkSummary(vendorIds: string[], range: { from?: Date; to?: Date } = {}) {
    if (vendorIds.length === 0) {
      return {
        totals: {
          vendorCount: 0,
          activeVendorCount: 0,
          orderCount: 0,
          totalPurchase: 0,
          averageOrderValue: 0,
          walletBalance: 0,
        },
        trend: [],
        topVendors: [],
      };
    }

    const to = range.to ?? new Date();
    const from = range.from ?? new Date(to.getFullYear(), to.getMonth() - 5, 1);

    const [orders, wallets, breakdown] = await Promise.all([
      prisma.productionOrder.findMany({
        where: {
          customerId: { in: vendorIds },
          status: { notIn: NON_BILLABLE },
          createdAt: { gte: from, lte: to },
        },
        select: { customerId: true, createdAt: true, totalAmount: true },
      }),
      prisma.wallet.aggregate({
        where: { userId: { in: vendorIds } },
        _sum: { currentBalance: true },
      }),
      this.vendorBreakdown(vendorIds, { from, to }),
    ]);

    const trendMap = new Map<string, { spend: number; orders: number }>();
    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 7);
      const bucket = trendMap.get(key) ?? { spend: 0, orders: 0 };
      bucket.spend = round2(bucket.spend + num(order.totalAmount));
      bucket.orders += 1;
      trendMap.set(key, bucket);
    }

    const totalPurchase = round2(orders.reduce((sum, order) => sum + num(order.totalAmount), 0));

    return {
      totals: {
        vendorCount: vendorIds.length,
        // "Active" means they actually ordered in the period — the number a partner is judged on.
        activeVendorCount: new Set(orders.map((order) => order.customerId)).size,
        orderCount: orders.length,
        totalPurchase,
        averageOrderValue: orders.length === 0 ? 0 : round2(totalPurchase / orders.length),
        walletBalance: round2(num(wallets._sum.currentBalance)),
      },
      trend: [...trendMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, value]) => ({ period, ...value })),
      topVendors: breakdown.slice(0, 5),
    };
  }

  /**
   * What a commission would come to, if one were in force.
   *
   * Returns null when the partner has no active plan, which is the normal state today. Kept
   * separate from the revenue figures so nothing downstream can mistake an estimate for a
   * liability.
   */
  async commissionEstimate(
    partnerProfileId: string,
    vendorIds: string[],
    range: { from?: Date; to?: Date } = {},
  ): Promise<{
    planName: string;
    basis: string;
    ratePercent: number;
    eligibleValue: number;
    estimate: number;
    cappedAt: number | null;
    isIndicativeOnly: true;
  } | null> {
    if (vendorIds.length === 0) return null;

    const now = new Date();
    const plan = await prisma.channelPartnerCommissionPlan.findFirst({
      where: {
        partnerProfileId,
        status: CommissionPlanStatus.ACTIVE,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!plan) return null;

    const minOrderValue = num(plan.minOrderValue);
    const orders = await prisma.productionOrder.aggregate({
      where: {
        customerId: { in: vendorIds },
        status: { notIn: NON_BILLABLE },
        ...((range.from ?? range.to) && {
          createdAt: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) },
        }),
        ...(minOrderValue > 0 ? { totalAmount: { gte: new Prisma.Decimal(minOrderValue) } } : {}),
      },
      _sum: { subtotal: true, totalAmount: true },
    });

    const eligibleValue = round2(
      plan.basis === 'ORDER_SUBTOTAL' ? num(orders._sum.subtotal) : num(orders._sum.totalAmount),
    );
    const rate = num(plan.ratePercent);
    const raw = round2((eligibleValue * rate) / 100);
    const cap = num(plan.monthlyCap);
    const estimate = cap > 0 ? Math.min(raw, cap) : raw;

    return {
      planName: plan.name,
      basis: plan.basis,
      ratePercent: rate,
      eligibleValue,
      estimate: round2(estimate),
      cappedAt: cap > 0 ? cap : null,
      isIndicativeOnly: true,
    };
  }
}

export const partnerStatsService = new PartnerStatsService();

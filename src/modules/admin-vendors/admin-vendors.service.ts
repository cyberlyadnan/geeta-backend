import { ActivityAction, UserStatus, VendorAccountStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { TtlCache } from '../../common/cache/ttl-cache.js';
import { activityLogService } from '../../services/activity/index.js';
import type {
  CreateAdminNoteInput,
  ListVendorsQuery,
  UpdateVendorDeliveryPreferenceInput,
  UpdateVendorStatusInput,
} from './admin-vendors.validation.js';
import {
  VENDOR_ADMIN_DETAIL_INCLUDE,
  VENDOR_ADMIN_USER_SELECT,
  mapVendorDetailToDto,
  mapVendorListItemToDto,
  mapVendorStatusUpdateToDto,
} from './admin-vendors.serialization.js';
import { USER_SUMMARY_SELECT } from '../../common/security/user.serialization.js';

const vendorStatsCache = new TtlCache<VendorStatsDto>(
  Number(process.env['VENDOR_STATS_CACHE_TTL_MS'] ?? 15_000),
);

const activityFeedCaches = new Map<
  number,
  TtlCache<Awaited<ReturnType<typeof activityLogService.listRecentVendorActivity>>>
>();

function activityFeedCacheFor(limit: number) {
  let cache = activityFeedCaches.get(limit);
  if (!cache) {
    cache = new TtlCache(Number(process.env['ACTIVITY_FEED_CACHE_TTL_MS'] ?? 10_000));
    activityFeedCaches.set(limit, cache);
  }
  return cache;
}

interface VendorStatsDto {
  pending: number;
  verified: number;
  rejected: number;
  suspended: number;
  total: number;
}

export class AdminVendorsService {
  async list(query: ListVendorsQuery) {
    const { page, limit, search, status, deliveryPreference, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.VendorProfileWhereInput = {
      ...(status && { accountStatus: status }),
      ...(deliveryPreference && { deliveryPreference }),
      ...(search && {
        OR: [
          { vendorCode: { contains: search, mode: 'insensitive' } },
          { businessName: { contains: search, mode: 'insensitive' } },
          { ownerName: { contains: search, mode: 'insensitive' } },
          { gstNumber: { contains: search, mode: 'insensitive' } },
          { user: { phone: { contains: search } } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.vendorProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: { select: VENDOR_ADMIN_USER_SELECT },
        },
      }),
      prisma.vendorProfile.count({ where }),
    ]);

    return {
      items: items.map(mapVendorListItemToDto),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string) {
    const profile = await prisma.vendorProfile.findUnique({
      where: { id },
      include: VENDOR_ADMIN_DETAIL_INCLUDE,
    });

    if (!profile) {
      throw ApiError.notFound('Vendor not found');
    }

    const activities = await activityLogService.listByVendor(id, 100);

    return mapVendorDetailToDto(profile, activities);
  }

  async updateStatus(
    id: string,
    input: UpdateVendorStatusInput,
    adminId: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const profile = await prisma.vendorProfile.findUnique({
      where: { id },
      select: { id: true, userId: true, accountStatus: true, verificationRemarks: true, user: { select: { status: true } } },
    });

    if (!profile) {
      throw ApiError.notFound('Vendor not found');
    }

    const now = new Date();
    const data: Prisma.VendorProfileUpdateInput = {
      accountStatus: input.status,
      verificationRemarks: input.verificationRemarks ?? profile.verificationRemarks,
    };

    if (input.status === VendorAccountStatus.VERIFIED) {
      data.verifiedAt = now;
      data.verifiedBy = { connect: { id: adminId } };
      data.rejectedAt = null;
      data.rejectedBy = { disconnect: true };
    } else if (input.status === VendorAccountStatus.REJECTED) {
      data.rejectedAt = now;
      data.rejectedBy = { connect: { id: adminId } };
    }

    const updated = await prisma.vendorProfile.update({
      where: { id },
      data,
      include: { user: { select: VENDOR_ADMIN_USER_SELECT } },
    });

    let userStatus: UserStatus = profile.user.status;
    if (input.status === VendorAccountStatus.VERIFIED) {
      userStatus = UserStatus.ACTIVE;
    } else if (
      input.status === VendorAccountStatus.SUSPENDED ||
      input.status === VendorAccountStatus.BLOCKED
    ) {
      userStatus = UserStatus.SUSPENDED;
    } else if (input.status === VendorAccountStatus.PENDING) {
      userStatus = UserStatus.PENDING_VERIFICATION;
    }

    await prisma.user.update({
      where: { id: profile.userId },
      data: { status: userStatus },
    });

    const action =
      input.status === VendorAccountStatus.VERIFIED
        ? ActivityAction.VENDOR_VERIFIED
        : input.status === VendorAccountStatus.REJECTED
          ? ActivityAction.VENDOR_REJECTED
          : input.status === VendorAccountStatus.SUSPENDED
            ? ActivityAction.VENDOR_SUSPENDED
            : ActivityAction.VENDOR_STATUS_CHANGED;

    await activityLogService.log({
      action,
      entityType: 'vendor_profile',
      entityId: id,
      vendorProfileId: id,
      actorId: adminId,
      metadata: {
        from: profile.accountStatus,
        to: input.status,
        remarks: input.verificationRemarks,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    this.invalidateVendorCaches();
    return mapVendorStatusUpdateToDto(updated);
  }

  async updateDeliveryPreference(
    id: string,
    input: UpdateVendorDeliveryPreferenceInput,
    adminId: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const profile = await prisma.vendorProfile.findUnique({
      where: { id },
      select: { id: true, deliveryPreference: true },
    });

    if (!profile) {
      throw ApiError.notFound('Vendor not found');
    }

    const updated = await prisma.vendorProfile.update({
      where: { id },
      data: { deliveryPreference: input.deliveryPreference },
      include: { user: { select: VENDOR_ADMIN_USER_SELECT } },
    });

    await activityLogService.log({
      action: ActivityAction.VENDOR_DELIVERY_PREFERENCE_CHANGED,
      entityType: 'vendor_profile',
      entityId: id,
      vendorProfileId: id,
      actorId: adminId,
      metadata: {
        from: profile.deliveryPreference,
        to: input.deliveryPreference,
        updatedByAdmin: true,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return {
      id: updated.id,
      vendorCode: updated.vendorCode,
      businessName: updated.businessName,
      deliveryPreference: updated.deliveryPreference,
      updatedAt: updated.updatedAt,
    };
  }

  async addNote(
    vendorProfileId: string,
    input: CreateAdminNoteInput,
    authorId: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const profile = await prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
    if (!profile) {
      throw ApiError.notFound('Vendor not found');
    }

    const note = await prisma.adminNote.create({
      data: {
        vendorProfileId,
        authorId,
        content: input.content,
      },
      include: {
        author: { select: USER_SUMMARY_SELECT },
      },
    });

    await activityLogService.log({
      action: ActivityAction.ADMIN_NOTE_ADDED,
      entityType: 'admin_note',
      entityId: note.id,
      vendorProfileId,
      actorId: authorId,
      metadata: { preview: input.content.slice(0, 120) },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return note;
  }

  async getActivityFeed(limit = 20) {
    const items = await activityFeedCacheFor(limit).getOrLoad(() =>
      activityLogService.listRecentVendorActivity(limit),
    );
    return { items };
  }

  private async getStatsUncached() {
    const rows = await prisma.vendorProfile.groupBy({
      by: ['accountStatus'],
      _count: { _all: true },
    });

    const countByStatus = new Map(rows.map((r) => [r.accountStatus, r._count._all]));

    const pending = countByStatus.get(VendorAccountStatus.PENDING) ?? 0;
    const verified = countByStatus.get(VendorAccountStatus.VERIFIED) ?? 0;
    const rejected = countByStatus.get(VendorAccountStatus.REJECTED) ?? 0;
    const suspended =
      (countByStatus.get(VendorAccountStatus.SUSPENDED) ?? 0) +
      (countByStatus.get(VendorAccountStatus.BLOCKED) ?? 0);
    const total = rows.reduce((sum, r) => sum + r._count._all, 0);

    return { pending, verified, rejected, suspended, total };
  }

  async getStats() {
    return vendorStatsCache.getOrLoad(() => this.getStatsUncached());
  }

  private invalidateVendorCaches(): void {
    vendorStatsCache.invalidate();
    for (const cache of activityFeedCaches.values()) {
      cache.invalidate();
    }
  }
}

export const adminVendorsService = new AdminVendorsService();

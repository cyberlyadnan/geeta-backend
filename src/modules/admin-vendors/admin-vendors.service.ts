import { ActivityAction, UserStatus, VendorAccountStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { vendorCodeSearchTerms } from '../../constants/vendor-code.js';
import { ApiError } from '../../common/errors/ApiError.js';
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
import { vendorSummaryReadModel } from '../../read-models/vendor-summary.read-model.js';

export class AdminVendorsService {
  async list(query: ListVendorsQuery) {
    const { page, limit, search, status, deliveryPreference, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.VendorProfileWhereInput = {
      ...(status && { accountStatus: status }),
      ...(deliveryPreference && { deliveryPreference }),
      ...(search && {
        OR: [
          ...vendorCodeSearchTerms(search).map((term) => ({
            vendorCode: { contains: term, mode: 'insensitive' as const },
          })),
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

  /**
   * Vendors staff most recently placed an order for.
   *
   * The admin create-order screen leads with this: in a print shop the same handful of vendors
   * come back day after day, so the fastest path is almost always "the one I did yesterday"
   * rather than typing a name. Ordered by that vendor's most recent order, newest first.
   */
  async listRecentlyOrderedFor(limit = 8) {
    // Distinct customer ids off the order table, newest first. `distinct` with `orderBy` keeps
    // the newest row per customer, which is exactly the recency we want to sort by.
    const recentOrders = await prisma.productionOrder.findMany({
      where: { customerId: { not: null } },
      distinct: ['customerId'],
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { customerId: true, createdAt: true },
    });

    const userIds = recentOrders.map((o) => o.customerId!).filter(Boolean);
    if (userIds.length === 0) return { items: [] };

    const profiles = await prisma.vendorProfile.findMany({
      where: { userId: { in: userIds } },
      include: { user: { select: VENDOR_ADMIN_USER_SELECT } },
    });

    // Re-apply the recency order the profile query lost.
    const orderIndex = new Map(userIds.map((id, index) => [id, index]));
    const lastOrderedAt = new Map(recentOrders.map((o) => [o.customerId!, o.createdAt]));

    return {
      items: profiles
        .sort((a, b) => (orderIndex.get(a.userId) ?? 0) - (orderIndex.get(b.userId) ?? 0))
        .map((profile) => ({
          ...mapVendorListItemToDto(profile),
          lastOrderedAt: lastOrderedAt.get(profile.userId)?.toISOString() ?? null,
        })),
    };
  }

  async getById(id: string) {
    const [profile, activities] = await Promise.all([
      prisma.vendorProfile.findUnique({
        where: { id },
        include: VENDOR_ADMIN_DETAIL_INCLUDE,
      }),
      activityLogService.listByVendor(id, 100),
    ]);

    if (!profile) {
      throw ApiError.notFound('Vendor not found');
    }

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

    activityLogService.logAsync({
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

    activityLogService.logAsync({
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

    activityLogService.logAsync({
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
    const items = await vendorSummaryReadModel.getActivityFeed(limit);
    return { items };
  }

  async getStats() {
    return vendorSummaryReadModel.getStats();
  }

  private invalidateVendorCaches(): void {
    vendorSummaryReadModel.invalidateAll();
  }
}

export const adminVendorsService = new AdminVendorsService();

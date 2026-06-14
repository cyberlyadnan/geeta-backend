import { ActivityAction, UserStatus, VendorAccountStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { activityLogService } from '../../services/activity/index.js';
import type {
  CreateAdminNoteInput,
  ListVendorsQuery,
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

export class AdminVendorsService {
  async list(query: ListVendorsQuery) {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.VendorProfileWhereInput = {
      ...(status && { accountStatus: status }),
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

    return mapVendorStatusUpdateToDto(updated);
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
    const items = await activityLogService.listRecentVendorActivity(limit);
    return { items };
  }

  async getStats() {
    const [pending, verified, rejected, suspended, total] = await Promise.all([
      prisma.vendorProfile.count({ where: { accountStatus: VendorAccountStatus.PENDING } }),
      prisma.vendorProfile.count({ where: { accountStatus: VendorAccountStatus.VERIFIED } }),
      prisma.vendorProfile.count({ where: { accountStatus: VendorAccountStatus.REJECTED } }),
      prisma.vendorProfile.count({
        where: {
          accountStatus: { in: [VendorAccountStatus.SUSPENDED, VendorAccountStatus.BLOCKED] },
        },
      }),
      prisma.vendorProfile.count(),
    ]);

    return { pending, verified, rejected, suspended, total };
  }
}

export const adminVendorsService = new AdminVendorsService();

import type { Prisma } from '@prisma/client';
import {
  USER_ADMIN_LIST_SELECT,
  USER_SUMMARY_SELECT,
  mapUserPublicToDto,
  mapUserSummaryToDto,
} from '../../common/security/user.serialization.js';

export const VENDOR_ADMIN_USER_SELECT = USER_ADMIN_LIST_SELECT;

export const VENDOR_ADMIN_DETAIL_INCLUDE = {
  user: { select: USER_ADMIN_LIST_SELECT },
  verifiedBy: { select: USER_SUMMARY_SELECT },
  rejectedBy: { select: USER_SUMMARY_SELECT },
  adminNotes: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      author: { select: USER_SUMMARY_SELECT },
    },
  },
} satisfies Prisma.VendorProfileInclude;

type VendorWithAdminDetail = Prisma.VendorProfileGetPayload<{
  include: typeof VENDOR_ADMIN_DETAIL_INCLUDE;
}>;

type VendorListItem = Prisma.VendorProfileGetPayload<{
  include: { user: { select: typeof USER_ADMIN_LIST_SELECT } };
}>;

export function mapVendorListItemToDto(profile: VendorListItem) {
  return {
    id: profile.id,
    vendorCode: profile.vendorCode,
    businessName: profile.businessName,
    ownerName: profile.ownerName,
    accountStatus: profile.accountStatus,
    country: profile.country,
    pinCode: profile.pinCode,
    gstNumber: profile.gstNumber,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    user: mapUserPublicToDto(profile.user),
  };
}

export function mapVendorDetailToDto(
  profile: VendorWithAdminDetail,
  activities: unknown[],
) {
  return {
    profile: {
      ...profile,
      user: mapUserPublicToDto(profile.user),
      verifiedBy: mapUserSummaryToDto(profile.verifiedBy),
      rejectedBy: mapUserSummaryToDto(profile.rejectedBy),
      adminNotes: profile.adminNotes.map((note) => ({
        ...note,
        author: mapUserSummaryToDto(note.author),
      })),
    },
    activities,
  };
}

export function mapVendorStatusUpdateToDto(
  profile: Prisma.VendorProfileGetPayload<{
    include: { user: { select: typeof USER_ADMIN_LIST_SELECT } };
  }>,
) {
  return {
    id: profile.id,
    vendorCode: profile.vendorCode,
    businessName: profile.businessName,
    accountStatus: profile.accountStatus,
    verificationRemarks: profile.verificationRemarks,
    verifiedAt: profile.verifiedAt,
    rejectedAt: profile.rejectedAt,
    updatedAt: profile.updatedAt,
    user: mapUserPublicToDto(profile.user),
  };
}

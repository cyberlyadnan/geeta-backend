import { prisma } from '../../config/database.js';
import { formatVendorCodeDisplay } from '../../constants/vendor-code.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { resolveSupportContact } from '../../config/business-contact.js';
import { USER_PUBLIC_SELECT } from '../../common/security/user.serialization.js';
import { vendorComplianceService } from '../vendor-compliance/vendor-compliance.service.js';
import {
  mapVendorSettingsProfile,
  VENDOR_SETTINGS_PROFILE_SELECT,
  VENDOR_SETTINGS_USER_SELECT,
} from './vendors.serialization.js';

export class VendorsService {
  async getMyProfile(userId: string) {
    const profile = await prisma.vendorProfile.findUnique({
      where: { userId },
      select: {
        ...VENDOR_SETTINGS_PROFILE_SELECT,
        user: { select: VENDOR_SETTINGS_USER_SELECT },
      },
    });

    if (!profile) {
      throw ApiError.forbidden('Vendor profile not found');
    }

    return mapVendorSettingsProfile(profile);
  }

  async getStatusByPhone(phone: string) {
    const user = await prisma.user.findFirst({
      where: { phone, deletedAt: null },
      select: {
        ...USER_PUBLIC_SELECT,
        vendorProfile: true,
      },
    });

    if (!user?.vendorProfile) {
      throw ApiError.notFound('No registration found for this mobile number');
    }

    const profile = user.vendorProfile;

    const pendingRequests = await vendorComplianceService.getPendingForVendor(profile.id);

    return {
      vendorCode: formatVendorCodeDisplay(profile.vendorCode) ?? profile.vendorCode,
      businessName: profile.businessName,
      ownerName: profile.ownerName,
      phone: user.phone,
      email: user.email,
      accountStatus: profile.accountStatus,
      verificationRemarks: profile.verificationRemarks,
      registeredAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      verifiedAt: profile.verifiedAt,
      ...resolveSupportContact(),
      pendingComplianceRequests: vendorComplianceService.mapRequestForVendorStatus(
        pendingRequests,
      ),
    };
  }
}

export const vendorsService = new VendorsService();

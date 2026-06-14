import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { resolveSupportContact } from '../../config/business-contact.js';
import { USER_PUBLIC_SELECT } from '../../common/security/user.serialization.js';
import { vendorComplianceService } from '../vendor-compliance/vendor-compliance.service.js';

export class VendorsService {
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
      vendorCode: profile.vendorCode,
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

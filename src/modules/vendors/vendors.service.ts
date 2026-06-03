import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { vendorComplianceService } from '../vendor-compliance/vendor-compliance.service.js';

const SUPPORT_PHONE = process.env['SUPPORT_PHONE'] ?? '+91 93198 23229';
const SUPPORT_EMAIL = process.env['SUPPORT_EMAIL'] ?? 'support@geetaprint.com';

export class VendorsService {
  async getStatusByPhone(phone: string) {
    const user = await prisma.user.findFirst({
      where: { phone, deletedAt: null },
      include: { vendorProfile: true },
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
      supportPhone: SUPPORT_PHONE,
      supportEmail: SUPPORT_EMAIL,
      pendingComplianceRequests: vendorComplianceService.mapRequestForVendorStatus(
        pendingRequests,
      ),
    };
  }
}

export const vendorsService = new VendorsService();

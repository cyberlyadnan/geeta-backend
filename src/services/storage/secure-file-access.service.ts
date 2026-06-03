import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { STORAGE_FOLDERS } from './storage.types.js';
import { storageService } from './storage.service.js';

export function vendorComplianceKeyPrefix(vendorProfileId: string): string {
  return `${STORAGE_FOLDERS.VENDORS}/compliance/${vendorProfileId}/`;
}

export function assertVendorComplianceFileKey(fileKey: string, vendorProfileId: string): void {
  const prefix = vendorComplianceKeyPrefix(vendorProfileId);
  if (!fileKey.startsWith(prefix) || fileKey.includes('..')) {
    throw ApiError.badRequest('Invalid file reference');
  }
}

export class SecureFileAccessService {
  private async loadVendorComplianceFile(vendorProfileId: string, fileAssetId: string) {
    const link = await prisma.vendorComplianceResponse.findFirst({
      where: {
        vendorProfileId,
        fileAssetId,
      },
      include: { fileAsset: true },
    });

    if (!link?.fileAsset) {
      throw ApiError.notFound('Document not found');
    }

    assertVendorComplianceFileKey(link.fileAsset.fileKey, vendorProfileId);
    return link.fileAsset;
  }

  async createAdminVendorComplianceDownload(vendorProfileId: string, fileAssetId: string) {
    const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
    if (!vendor) {
      throw ApiError.notFound('Vendor not found');
    }

    const asset = await this.loadVendorComplianceFile(vendorProfileId, fileAssetId);
    return storageService.createPresignedDownload(asset.fileKey, {
      fileName: asset.originalName,
      mimeType: asset.mimeType,
    });
  }

  async createVendorComplianceDownload(phone: string, fileAssetId: string) {
    const user = await prisma.user.findFirst({
      where: { phone, deletedAt: null },
      include: { vendorProfile: true },
    });

    if (!user?.vendorProfile) {
      throw ApiError.notFound('No registration found for this mobile number');
    }

    const asset = await this.loadVendorComplianceFile(user.vendorProfile.id, fileAssetId);
    return storageService.createPresignedDownload(asset.fileKey, {
      fileName: asset.originalName,
      mimeType: asset.mimeType,
    });
  }
}

export const secureFileAccessService = new SecureFileAccessService();

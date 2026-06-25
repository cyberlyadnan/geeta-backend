import { prisma } from '../config/database.js';
import { ApiError } from '../common/errors/ApiError.js';
import { loadOncePerRequest } from '../common/cache/request-cache-accessor.js';
import { setRequestVendorProfileId } from '../observability/request-context.js';
import type { Request } from 'express';

const VENDOR_DELIVERY_SELECT = {
  id: true,
  deliveryPreference: true,
  fullAddress: true,
  pinCode: true,
  city: true,
  state: true,
  businessName: true,
} as const;

export type VendorDeliveryProfile = Awaited<ReturnType<VendorRepository['getForDelivery']>>;

export class VendorRepository {
  getForDelivery(userId: string, req?: Request) {
    return loadOncePerRequest(
      `vendor:delivery:${userId}`,
      async () => {
        const profile = await prisma.vendorProfile.findUnique({
          where: { userId },
          select: VENDOR_DELIVERY_SELECT,
        });
        if (!profile) {
          throw ApiError.forbidden('Vendor profile required');
        }
        setRequestVendorProfileId(profile.id, req);
        return profile;
      },
      req,
    );
  }

  findById(id: string) {
    return loadOncePerRequest(`vendor:id:${id}`, () =>
      prisma.vendorProfile.findUnique({ where: { id } }),
    );
  }

  findByUserId(userId: string) {
    return loadOncePerRequest(`vendor:user:${userId}`, () =>
      prisma.vendorProfile.findUnique({ where: { userId } }),
    );
  }
}

export const vendorRepository = new VendorRepository();

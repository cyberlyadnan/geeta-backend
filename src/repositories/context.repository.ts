import { RoleName } from '@prisma/client';
import type { Request } from 'express';
import { loadOncePerRequest } from '../common/cache/request-cache-accessor.js';
import { deliverySettingsRepository } from './delivery-settings.repository.js';
import { vendorRepository } from './vendor.repository.js';
import { userRepository } from './user.repository.js';

/** Vendor checkout / order creation — settings + profile in one cached request load */
export interface VendorCheckoutContext {
  settings: Awaited<ReturnType<typeof deliverySettingsRepository.getOrCreate>>;
  vendor: Awaited<ReturnType<typeof vendorRepository.getForDelivery>>;
}

/** Authenticated session — user row + optional vendor profile */
export interface AuthenticatedUserContext {
  user: NonNullable<Awaited<ReturnType<typeof userRepository.findSessionById>>>;
  vendorProfile: Awaited<ReturnType<typeof vendorRepository.findByUserId>> | null;
}

export class ContextRepository {
  getVendorCheckoutContext(userId: string, req?: Request): Promise<VendorCheckoutContext> {
    return loadOncePerRequest(
      `ctx:vendor-checkout:${userId}`,
      async () => {
        const [settings, vendor] = await Promise.all([
          deliverySettingsRepository.getOrCreate(),
          vendorRepository.getForDelivery(userId, req),
        ]);
        return { settings, vendor };
      },
      req,
    );
  }

  getAuthenticatedUserContext(
    userId: string,
    role: RoleName,
    req?: Request,
  ): Promise<AuthenticatedUserContext> {
    return loadOncePerRequest(
      `ctx:auth:${userId}`,
      async () => {
        if (role === RoleName.VENDOR) {
          const [user, vendorProfile] = await Promise.all([
            userRepository.findSessionById(userId),
            vendorRepository.findByUserId(userId),
          ]);
          if (!user) {
            throw new Error('Authenticated user not found');
          }
          return { user, vendorProfile };
        }

        const user = await userRepository.findSessionById(userId);
        if (!user) {
          throw new Error('Authenticated user not found');
        }
        return { user, vendorProfile: null };
      },
      req,
    );
  }
}

export const contextRepository = new ContextRepository();

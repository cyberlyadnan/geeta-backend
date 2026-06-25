import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { TtlCache } from '../../common/cache/ttl-cache.js';
import { CacheKeys, CacheTtl } from '../../common/cache/cache-keys.js';
import { redisCache } from '../../common/cache/redis-cache.js';
import { loadOncePerRequest } from '../../common/cache/request-cache-accessor.js';
import type { DeliveryPlatformSettings } from './delivery.types.js';
import { vendorRepository } from '../../repositories/vendor.repository.js';

const deliverySettingsLocalCache = new TtlCache<
  DeliveryPlatformSettings & { id: string; updatedAt: Date }
>(Number(process.env['DELIVERY_SETTINGS_CACHE_TTL_MS'] ?? 60_000));

function mapDeliveryRow(row: {
  id: string;
  defaultDeliveryCharge: Prisma.Decimal;
  isDeliveryEnabled: boolean;
  isPickupEnabled: boolean;
  futureConfig: unknown;
  updatedAt: Date;
}): DeliveryPlatformSettings & { id: string; updatedAt: Date } {
  return {
    id: row.id,
    defaultDeliveryCharge: Number(row.defaultDeliveryCharge),
    isDeliveryEnabled: row.isDeliveryEnabled,
    isPickupEnabled: row.isPickupEnabled,
    currency: 'INR',
    futureConfig: (row.futureConfig as Record<string, unknown>) ?? {},
    updatedAt: row.updatedAt,
  };
}

export class DeliverySettingsRepository {
  async getOrCreate() {
    return loadOncePerRequest('delivery:settings', () =>
      deliverySettingsLocalCache.getOrLoad(async () => {
        const redisHit = await redisCache.get<ReturnType<typeof mapDeliveryRow>>(
          CacheKeys.deliverySettings(),
        );
        if (redisHit) return redisHit;

        const row = await prisma.deliverySettings.findUnique({ where: { id: 'default' } });
        const resolved = row
          ? mapDeliveryRow(row)
          : mapDeliveryRow(
              await prisma.deliverySettings.create({
                data: {
                  id: 'default',
                  defaultDeliveryCharge: 100,
                  isDeliveryEnabled: true,
                  isPickupEnabled: true,
                },
              }),
            );

        void redisCache.set(CacheKeys.deliverySettings(), resolved, CacheTtl.DELIVERY_SETTINGS_SEC);
        return resolved;
      }),
    );
  }

  invalidateCache(): void {
    deliverySettingsLocalCache.invalidate();
    void redisCache.del(CacheKeys.deliverySettings());
  }

  async update(
    data: Partial<{
      defaultDeliveryCharge: number;
      isDeliveryEnabled: boolean;
      isPickupEnabled: boolean;
      futureConfig: Record<string, unknown>;
    }>,
    updatedById: string,
  ) {
    const row = await prisma.deliverySettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        defaultDeliveryCharge: data.defaultDeliveryCharge ?? 100,
        isDeliveryEnabled: data.isDeliveryEnabled ?? true,
        isPickupEnabled: data.isPickupEnabled ?? true,
        futureConfig: (data.futureConfig ?? {}) as Prisma.InputJsonValue,
        updatedById,
      },
      update: {
        ...(data.defaultDeliveryCharge !== undefined && {
          defaultDeliveryCharge: data.defaultDeliveryCharge,
        }),
        ...(data.isDeliveryEnabled !== undefined && { isDeliveryEnabled: data.isDeliveryEnabled }),
        ...(data.isPickupEnabled !== undefined && { isPickupEnabled: data.isPickupEnabled }),
        ...(data.futureConfig !== undefined && {
          futureConfig: data.futureConfig as Prisma.InputJsonValue,
        }),
        updatedById,
      },
      include: {
        updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    this.invalidateCache();
    return row;
  }
}

/** @deprecated Use vendorRepository.getForDelivery */
export async function getVendorProfileForDelivery(userId: string) {
  return vendorRepository.getForDelivery(userId);
}

export function formatVendorAddress(profile: {
  fullAddress: string;
  pinCode: string;
  city?: string | null;
  state?: string | null;
}): string {
  const parts = [profile.fullAddress, profile.city, profile.state, profile.pinCode].filter(Boolean);
  return parts.join(', ');
}

export const deliverySettingsRepository = new DeliverySettingsRepository();

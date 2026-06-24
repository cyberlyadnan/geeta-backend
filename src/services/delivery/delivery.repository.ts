import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import type { DeliveryPlatformSettings } from './delivery.types.js';

export class DeliverySettingsRepository {
  async getOrCreate(): Promise<DeliveryPlatformSettings & { id: string; updatedAt: Date }> {
    let row = await prisma.deliverySettings.findUnique({ where: { id: 'default' } });
    if (!row) {
      row = await prisma.deliverySettings.create({
        data: {
          id: 'default',
          defaultDeliveryCharge: 100,
          isDeliveryEnabled: true,
          isPickupEnabled: true,
        },
      });
    }

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

    return row;
  }
}

export async function getVendorProfileForDelivery(userId: string) {
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      deliveryPreference: true,
      fullAddress: true,
      pinCode: true,
      city: true,
      state: true,
      businessName: true,
    },
  });

  if (!profile) {
    throw ApiError.forbidden('Vendor profile required');
  }

  return profile;
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

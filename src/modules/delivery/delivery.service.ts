import { ActivityAction, DeliveryPreference } from '@prisma/client';
import { activityLogService } from '../../services/activity/index.js';
import {
  calculateOrderTotals,
  deliverySettingsRepository,
  formatVendorAddress,
  resolveDeliveryForOrder,
} from '../../services/delivery/index.js';
import { contextRepository } from '../../repositories/context.repository.js';
import { vendorRepository } from '../../repositories/vendor.repository.js';
import { prisma } from '../../config/database.js';
import type {
  CalculateOrderDeliveryInput,
  UpdateAdminDeliverySettingsInput,
  UpdateDeliveryPreferenceInput,
} from './delivery.validation.js';

export class DeliveryService {
  async getVendorDeliveryContext(userId: string) {
    const { settings, vendor: profile } =
      await contextRepository.getVendorCheckoutContext(userId);

    const defaultAddress = formatVendorAddress(profile);

    return {
      platform: {
        defaultDeliveryCharge: settings.defaultDeliveryCharge,
        isDeliveryEnabled: settings.isDeliveryEnabled,
        isPickupEnabled: settings.isPickupEnabled,
        currency: settings.currency,
        futureConfig: settings.futureConfig,
      },
      vendor: {
        deliveryPreference: profile.deliveryPreference,
        defaultAddress,
        askOnOrder: profile.deliveryPreference === DeliveryPreference.ASK_ON_EVERY_ORDER,
        alwaysDelivery: profile.deliveryPreference === DeliveryPreference.ALWAYS_DELIVERY_REQUIRED,
        selfPickupOnly: profile.deliveryPreference === DeliveryPreference.SELF_PICKUP_ONLY,
      },
    };
  }

  async updateVendorDeliveryPreference(
    userId: string,
    input: UpdateDeliveryPreferenceInput,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const profile = await vendorRepository.getForDelivery(userId);
    const previous = profile.deliveryPreference;

    const updated = await prisma.vendorProfile.update({
      where: { id: profile.id },
      data: { deliveryPreference: input.deliveryPreference },
      select: {
        id: true,
        deliveryPreference: true,
        updatedAt: true,
      },
    });

    activityLogService.logAsync({
      action: ActivityAction.VENDOR_DELIVERY_PREFERENCE_CHANGED,
      entityType: 'vendor_profile',
      entityId: profile.id,
      vendorProfileId: profile.id,
      actorId: userId,
      metadata: { previous, next: input.deliveryPreference },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return updated;
  }

  async calculateOrderDelivery(userId: string, input: CalculateOrderDeliveryInput) {
    const { settings, vendor: profile } =
      await contextRepository.getVendorCheckoutContext(userId);

    const resolution = resolveDeliveryForOrder(settings, {
      vendorPreference: profile.deliveryPreference,
      orderDeliveryChoice: input.orderDeliveryChoice,
      deliveryAddress: input.deliveryAddress,
      vendorDefaultAddress: formatVendorAddress(profile),
    });

    const totals = calculateOrderTotals({
      productTotal: input.productTotal,
      deliveryResolution: resolution,
    });

    return {
      resolution: {
        deliveryRequired: resolution.deliveryRequired,
        deliveryType: resolution.deliveryType,
        deliveryCharge: resolution.deliveryCharge,
        deliveryAddress: resolution.deliveryAddress,
        canToggleDelivery: resolution.canToggleDelivery,
        askOnOrder: resolution.askOnOrder,
        preferenceApplied: resolution.preferenceApplied,
      },
      totals,
    };
  }

  async getAdminSettings() {
    return deliverySettingsRepository.getOrCreate();
  }

  async updateAdminSettings(
    adminUserId: string,
    input: UpdateAdminDeliverySettingsInput,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const row = await deliverySettingsRepository.update(input, adminUserId);

    activityLogService.logAsync({
      action: ActivityAction.DELIVERY_SETTINGS_UPDATED,
      entityType: 'delivery_settings',
      entityId: row.id,
      actorId: adminUserId,
      metadata: {
        defaultDeliveryCharge: Number(row.defaultDeliveryCharge),
        isDeliveryEnabled: row.isDeliveryEnabled,
        isPickupEnabled: row.isPickupEnabled,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return {
      id: row.id,
      defaultDeliveryCharge: Number(row.defaultDeliveryCharge),
      isDeliveryEnabled: row.isDeliveryEnabled,
      isPickupEnabled: row.isPickupEnabled,
      currency: 'INR',
      futureConfig: (row.futureConfig as Record<string, unknown>) ?? {},
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy
        ? {
            id: row.updatedBy.id,
            name: `${row.updatedBy.firstName} ${row.updatedBy.lastName}`.trim(),
            email: row.updatedBy.email,
          }
        : null,
    };
  }
}

export const deliveryService = new DeliveryService();

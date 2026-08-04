import {
  DeliveryPreference,
  DeliveryType,
} from '@prisma/client';
import { ApiError } from '../../common/errors/ApiError.js';
import type {
  DeliveryPlatformSettings,
  DeliveryResolution,
  DeliveryResolutionInput,
  OrderTotalsInput,
  OrderTotalsResult,
} from './delivery.types.js';
import { DEFAULT_GST_RATE } from './delivery.types.js';

/**
 * Resolves delivery behaviour from vendor preference + per-order choice.
 * Central business rules — do not duplicate in frontend.
 */
export function resolveDeliveryForOrder(
  settings: DeliveryPlatformSettings,
  input: DeliveryResolutionInput,
): DeliveryResolution {
  const { vendorPreference, orderDeliveryChoice, deliveryAddress, vendorDefaultAddress } = input;
  const address = deliveryAddress?.trim() || vendorDefaultAddress?.trim() || null;

  switch (vendorPreference) {
    case DeliveryPreference.ALWAYS_DELIVERY_REQUIRED: {
      if (!settings.isDeliveryEnabled) {
        throw ApiError.badRequest('Delivery is currently disabled by admin. Contact support.');
      }
      return {
        deliveryRequired: true,
        deliveryType: DeliveryType.DELIVERY,
        deliveryCharge: 0,
        indicativeDeliveryCharge: settings.defaultDeliveryCharge,
        deliveryAddress: address,
        canToggleDelivery: false,
        askOnOrder: false,
        preferenceApplied: vendorPreference,
      };
    }

    case DeliveryPreference.SELF_PICKUP_ONLY: {
      if (!settings.isPickupEnabled) {
        throw ApiError.badRequest('Self pickup is currently disabled by admin. Contact support.');
      }
      return {
        deliveryRequired: false,
        deliveryType: DeliveryType.SELF_PICKUP,
        deliveryCharge: 0,
        indicativeDeliveryCharge: 0,
        deliveryAddress: null,
        canToggleDelivery: false,
        askOnOrder: false,
        preferenceApplied: vendorPreference,
      };
    }

    case DeliveryPreference.ASK_ON_EVERY_ORDER: {
      if (orderDeliveryChoice === undefined || orderDeliveryChoice === null) {
        return {
          deliveryRequired: false,
          deliveryType: DeliveryType.SELF_PICKUP,
          deliveryCharge: 0,
          indicativeDeliveryCharge: 0,
          deliveryAddress: null,
          canToggleDelivery: true,
          askOnOrder: true,
          preferenceApplied: vendorPreference,
        };
      }

      if (orderDeliveryChoice) {
        if (!settings.isDeliveryEnabled) {
          throw ApiError.badRequest('Delivery is currently disabled by admin.');
        }
        return {
          deliveryRequired: true,
          deliveryType: DeliveryType.DELIVERY,
          deliveryCharge: 0,
          indicativeDeliveryCharge: settings.defaultDeliveryCharge,
          deliveryAddress: address,
          canToggleDelivery: true,
          askOnOrder: true,
          preferenceApplied: vendorPreference,
        };
      }

      if (!settings.isPickupEnabled) {
        throw ApiError.badRequest('Self pickup is currently disabled by admin.');
      }
      return {
        deliveryRequired: false,
        deliveryType: DeliveryType.SELF_PICKUP,
        deliveryCharge: 0,
        indicativeDeliveryCharge: 0,
        deliveryAddress: null,
        canToggleDelivery: true,
        askOnOrder: true,
        preferenceApplied: vendorPreference,
      };
    }

    default: {
      const _exhaustive: never = vendorPreference;
      throw ApiError.internal(`Unknown delivery preference: ${_exhaustive}`);
    }
  }
}

/** Computes order totals with delivery charge integrated into pricing flow */
export function calculateOrderTotals(input: OrderTotalsInput): OrderTotalsResult {
  const taxRate = input.taxRate ?? DEFAULT_GST_RATE;
  const { deliveryResolution, productTotal } = input;
  const deliveryCharge = deliveryResolution.deliveryCharge;
  const artworkEmailCharge = roundMoney(input.artworkEmailCharge ?? 0);
  const subtotalBeforeTax = roundMoney(productTotal + deliveryCharge + artworkEmailCharge);
  const taxAmount = roundMoney(subtotalBeforeTax * taxRate);
  const grandTotal = roundMoney(subtotalBeforeTax + taxAmount);

  return {
    productTotal: roundMoney(productTotal),
    deliveryCharge: roundMoney(deliveryCharge),
    artworkEmailCharge,
    subtotalBeforeTax,
    taxAmount,
    grandTotal,
    deliveryRequired: deliveryResolution.deliveryRequired,
    deliveryType: deliveryResolution.deliveryType,
    currency: 'INR',
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

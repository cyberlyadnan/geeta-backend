import type { DeliveryPreference, DeliveryType } from '@prisma/client';

/** Platform delivery configuration — extensible for zone/courier pricing */
export interface DeliveryPlatformSettings {
  defaultDeliveryCharge: number;
  isDeliveryEnabled: boolean;
  isPickupEnabled: boolean;
  currency: string;
  futureConfig: Record<string, unknown>;
}

export interface DeliveryResolutionInput {
  vendorPreference: DeliveryPreference;
  /** Required when preference is ASK_ON_EVERY_ORDER */
  orderDeliveryChoice?: boolean | null;
  /** Override address for this order; falls back to vendor profile address */
  deliveryAddress?: string | null;
  vendorDefaultAddress?: string | null;
}

export interface DeliveryResolution {
  deliveryRequired: boolean;
  deliveryType: DeliveryType;
  deliveryCharge: number;
  deliveryAddress: string | null;
  /** Whether vendor can change delivery on/off during order creation */
  canToggleDelivery: boolean;
  /** Show yes/no question during order creation */
  askOnOrder: boolean;
  preferenceApplied: DeliveryPreference;
}

export interface OrderTotalsInput {
  productTotal: number;
  deliveryResolution: DeliveryResolution;
  taxRate?: number;
}

export interface OrderTotalsResult {
  productTotal: number;
  deliveryCharge: number;
  subtotalBeforeTax: number;
  taxAmount: number;
  grandTotal: number;
  deliveryRequired: boolean;
  deliveryType: DeliveryType;
  currency: string;
}

export const DEFAULT_GST_RATE = 0.18;

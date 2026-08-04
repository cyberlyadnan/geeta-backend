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
  /**
   * Always 0 since Phase 3. Delivery is priced by the dispatcher at dispatch time against the
   * whole batch, not per order at checkout — billing it here too would double-charge the vendor.
   * Kept in the shape (rather than removed) so order totals, snapshots and amendment maths keep
   * a single delivery line that simply reads zero. See `indicativeDeliveryCharge` for display.
   */
  deliveryCharge: number;
  /**
   * The admin-configured `DeliverySettings.defaultDeliveryCharge`, for display only — what
   * delivery *typically* costs. Never billed at order time; the dispatcher UI uses it to
   * prefill the actual charge when billing a batch.
   */
  indicativeDeliveryCharge: number;
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
  /** Added when artwork is sent via email (fileOption === 'email') */
  artworkEmailCharge?: number;
}

export interface OrderTotalsResult {
  productTotal: number;
  deliveryCharge: number;
  artworkEmailCharge: number;
  subtotalBeforeTax: number;
  taxAmount: number;
  grandTotal: number;
  deliveryRequired: boolean;
  deliveryType: DeliveryType;
  currency: string;
}

export const DEFAULT_GST_RATE = 0.18;

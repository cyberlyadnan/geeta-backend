import { vendorRepository } from '../../repositories/vendor.repository.js';

/** @deprecated Use vendorRepository.getForDelivery */
export async function getVendorProfileForDelivery(userId: string) {
  return vendorRepository.getForDelivery(userId);
}

export {
  deliverySettingsRepository,
  DeliverySettingsRepository,
} from '../../repositories/delivery-settings.repository.js';

export function formatVendorAddress(profile: {
  fullAddress: string;
  pinCode: string;
  city?: string | null;
  state?: string | null;
}): string {
  const parts = [profile.fullAddress, profile.city, profile.state, profile.pinCode].filter(Boolean);
  return parts.join(', ');
}

import type { Prisma } from '@prisma/client';
import { formatVendorCodeDisplay } from '../../constants/vendor-code.js';
import { mapUserPublicToDto } from '../../common/security/user.serialization.js';
import { formatVendorAddress } from '../../services/delivery/delivery.repository.js';

export const VENDOR_SETTINGS_PROFILE_SELECT = {
  id: true,
  vendorCode: true,
  businessName: true,
  ownerName: true,
  alternatePhone: true,
  gstNumber: true,
  referenceCode: true,
  employeeCode: true,
  country: true,
  state: true,
  district: true,
  city: true,
  pinCode: true,
  fullAddress: true,
  businessType: true,
  services: true,
  accountStatus: true,
  deliveryPreference: true,
  verificationRemarks: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.VendorProfileSelect;

export const VENDOR_SETTINGS_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

type VendorSettingsRecord = Prisma.VendorProfileGetPayload<{
  select: typeof VENDOR_SETTINGS_PROFILE_SELECT & {
    user: { select: typeof VENDOR_SETTINGS_USER_SELECT };
  };
}>;

const SERVICE_LABELS: Record<string, string> = {
  uv_printing: 'UV Printing',
  digital_printing: 'Digital Printing',
  offset_printing: 'Offset Printing',
  flex_printing: 'Flex Printing',
};

function mapServices(services: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(services)) return [];
  return services
    .filter((s): s is string => typeof s === 'string')
    .map((id) => ({ id, label: SERVICE_LABELS[id] ?? id }));
}

export function mapVendorSettingsProfile(profile: VendorSettingsRecord) {
  const user = mapUserPublicToDto(profile.user);

  return {
    id: profile.id,
    vendorCode: formatVendorCodeDisplay(profile.vendorCode) ?? profile.vendorCode,
    businessName: profile.businessName,
    ownerName: profile.ownerName,
    alternatePhone: profile.alternatePhone,
    gstNumber: profile.gstNumber,
    referenceCode: profile.referenceCode,
    employeeCode: profile.employeeCode,
    country: profile.country,
    state: profile.state,
    district: profile.district,
    city: profile.city,
    pinCode: profile.pinCode,
    fullAddress: profile.fullAddress,
    formattedAddress: formatVendorAddress(profile),
    businessType: profile.businessType,
    services: mapServices(profile.services),
    accountStatus: profile.accountStatus,
    deliveryPreference: profile.deliveryPreference,
    verificationRemarks: profile.verificationRemarks,
    verifiedAt: profile.verifiedAt,
    registeredAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    user: {
      ...user,
      lastLoginAt: profile.user.lastLoginAt,
      accountCreatedAt: profile.user.createdAt,
    },
    editableFields: {
      deliveryPreference: false,
      alternatePhone: false,
      fullAddress: false,
      businessName: false,
      gstNumber: false,
      services: false,
      password: false,
    },
  };
}

export type VendorSettingsProfileDto = ReturnType<typeof mapVendorSettingsProfile>;

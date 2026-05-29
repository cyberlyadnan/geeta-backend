import type { User, Role, VendorProfile } from '@prisma/client';
import type { AuthUserResponse } from './auth.types.js';

type UserWithRole = User & { role: Role; vendorProfile?: VendorProfile | null };

export function mapUserToAuthResponse(user: UserWithRole): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role.name,
    status: user.status,
    vendorProfile: user.vendorProfile
      ? {
          id: user.vendorProfile.id,
          vendorCode: user.vendorProfile.vendorCode,
          businessName: user.vendorProfile.businessName,
          accountStatus: user.vendorProfile.accountStatus,
          verificationRemarks: user.vendorProfile.verificationRemarks,
        }
      : null,
  };
}

export function extractPermissions(role: Role): string[] {
  const permissions = role.permissions;
  if (Array.isArray(permissions)) {
    return permissions.filter((p): p is string => typeof p === 'string');
  }
  return [];
}

export function splitOwnerName(ownerName: string): { firstName: string; lastName: string } {
  const parts = ownerName.trim().split(/\s+/);
  const firstName = parts[0] ?? 'Vendor';
  const lastName = parts.slice(1).join(' ') || 'User';
  return { firstName, lastName };
}

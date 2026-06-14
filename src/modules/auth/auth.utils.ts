import type { UserLoginRecord, UserSessionRecord } from '../../common/security/user.serialization.js';
import { mapUserSessionToAuthDto } from '../../common/security/user.serialization.js';
import type { Role } from '@prisma/client';
import type { AuthUserResponse } from './auth.types.js';

/**
 * Normalize Indian mobile numbers for login lookup.
 * Strips spaces, +91 / 91 country code, and leading 0.
 */
export function normalizeIndianPhone(raw: string): string {
  let digits = raw.replace(/\s/g, '').replace(/[^\d+]/g, '');

  if (digits.startsWith('+91')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  return digits.replace(/\D/g, '');
}

export function isEmailIdentifier(value: string): boolean {
  return value.includes('@');
}

export function mapUserToAuthResponse(
  user: UserSessionRecord | UserLoginRecord,
): AuthUserResponse {
  return mapUserSessionToAuthDto(user);
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

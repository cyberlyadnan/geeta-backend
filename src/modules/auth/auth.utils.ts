import type { UserLoginRecord, UserSessionRecord } from '../../common/security/user.serialization.js';
import { mapUserSessionToAuthDto } from '../../common/security/user.serialization.js';
import type { Role } from '@prisma/client';
import type { AuthUserResponse } from './auth.types.js';

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

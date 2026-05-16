import type { User, Role } from '@prisma/client';
import type { AuthUserResponse } from './auth.types.js';

type UserWithRole = User & { role: Role };

export function mapUserToAuthResponse(user: UserWithRole): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role.name,
  };
}

export function extractPermissions(role: Role): string[] {
  const permissions = role.permissions;
  if (Array.isArray(permissions)) {
    return permissions.filter((p): p is string => typeof p === 'string');
  }
  return [];
}

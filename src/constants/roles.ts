import { RoleName } from '@prisma/client';

export const ROLES = RoleName;

export const ROLE_HIERARCHY: Record<RoleName, number> = {
  [RoleName.SUPER_ADMIN]: 100,
  [RoleName.ADMIN]: 80,
  [RoleName.MANAGER]: 60,
  [RoleName.STAFF]: 40,
  [RoleName.VENDOR]: 20,
  [RoleName.CUSTOMER]: 10,
};

export const INTERNAL_ROLES: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.STAFF,
];

export const EXTERNAL_ROLES: RoleName[] = [RoleName.CUSTOMER, RoleName.VENDOR];

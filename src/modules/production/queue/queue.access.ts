import { RoleName } from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';
import { QUEUE_PERMISSIONS } from './queue.constants.js';

const ADMIN_ROLES: ReadonlySet<RoleName> = new Set([
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
]);

export function canViewAllDepartments(role: RoleName, permissions: string[]): boolean {
  if (ADMIN_ROLES.has(role)) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes(QUEUE_PERMISSIONS.VIEW_ALL)) return true;
  if (permissions.includes('production.queue:*')) return true;
  if (permissions.includes('production:*')) return true;
  return false;
}

export function getAllowedDepartmentCodes(permissions: string[]): string[] {
  return permissions
    .filter((p) => p.startsWith('production.queue.dept:'))
    .map((p) => p.slice('production.queue.dept:'.length).toUpperCase());
}

export function assertDepartmentAccess(
  departmentCode: string,
  role: RoleName,
  permissions: string[],
): void {
  if (canViewAllDepartments(role, permissions)) return;

  const allowed = getAllowedDepartmentCodes(permissions);
  if (allowed.includes(departmentCode.toUpperCase())) return;

  if (permissions.includes(QUEUE_PERMISSIONS.VIEW) && allowed.length === 0) {
    throw ApiError.forbidden('No department queue access configured for this user');
  }

  throw ApiError.forbidden('You do not have access to this department queue');
}

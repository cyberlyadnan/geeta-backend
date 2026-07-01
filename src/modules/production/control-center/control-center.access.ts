import { RoleName } from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';
import { canViewAllDepartments } from '../queue/queue.access.js';
import { CONTROL_CENTER_PERMISSIONS } from './control-center.constants.js';

const MANAGER_ROLES: ReadonlySet<RoleName> = new Set([
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
]);

export function canViewControlCenter(role: RoleName, permissions: string[]): boolean {
  if (MANAGER_ROLES.has(role)) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes(CONTROL_CENTER_PERMISSIONS.ALL)) return true;
  if (permissions.includes(CONTROL_CENTER_PERMISSIONS.VIEW)) return true;
  if (permissions.includes('production:*')) return true;
  return canViewAllDepartments(role, permissions);
}

export function assertCanViewControlCenter(role: RoleName, permissions: string[]): void {
  if (!canViewControlCenter(role, permissions)) {
    throw ApiError.forbidden('You do not have permission to view the production control center');
  }
}

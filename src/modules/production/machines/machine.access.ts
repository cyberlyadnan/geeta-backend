import { RoleName } from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';
import { MACHINE_PERMISSIONS } from './machine.constants.js';

const MANAGER_ROLES: ReadonlySet<RoleName> = new Set([
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
]);

export function canViewMachines(role: RoleName, permissions: string[]): boolean {
  if (MANAGER_ROLES.has(role)) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes(MACHINE_PERMISSIONS.ALL)) return true;
  if (permissions.includes(MACHINE_PERMISSIONS.VIEW)) return true;
  if (permissions.includes(MACHINE_PERMISSIONS.MANAGE)) return true;
  if (permissions.includes('production:*')) return true;
  if (permissions.includes('production.task.execute')) return true;
  return false;
}

export function canManageMachines(role: RoleName, permissions: string[]): boolean {
  if (MANAGER_ROLES.has(role)) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes(MACHINE_PERMISSIONS.ALL)) return true;
  if (permissions.includes(MACHINE_PERMISSIONS.MANAGE)) return true;
  return false;
}

export function assertCanViewMachines(role: RoleName, permissions: string[]): void {
  if (!canViewMachines(role, permissions)) {
    throw ApiError.forbidden('You do not have permission to view machines');
  }
}

export function assertCanManageMachines(role: RoleName, permissions: string[]): void {
  if (!canManageMachines(role, permissions)) {
    throw ApiError.forbidden('You do not have permission to manage machines');
  }
}

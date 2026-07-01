import { RoleName } from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';
import { EXECUTION_PERMISSIONS } from './execution.constants.js';
import { canViewAllDepartments } from '../queue/queue.access.js';

const MANAGER_ROLES: ReadonlySet<RoleName> = new Set([
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
]);

export function canExecuteTasks(role: RoleName, permissions: string[]): boolean {
  if (MANAGER_ROLES.has(role)) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes(EXECUTION_PERMISSIONS.EXECUTE)) return true;
  if (permissions.includes('production.task:*')) return true;
  if (permissions.includes('production:*')) return true;
  return false;
}

export function canViewDepartmentExecution(role: RoleName, permissions: string[]): boolean {
  return canViewAllDepartments(role, permissions) || canExecuteTasks(role, permissions);
}

export function assertCanExecuteTask(
  operatorId: string,
  requesterId: string,
  role: RoleName,
  permissions: string[],
): void {
  if (operatorId === requesterId && canExecuteTasks(role, permissions)) return;
  if (MANAGER_ROLES.has(role)) return;
  if (permissions.includes(EXECUTION_PERMISSIONS.VIEW_ALL)) return;
  throw ApiError.forbidden('You do not have permission to execute this production task');
}

export function assertCanViewDepartmentExecution(
  role: RoleName,
  permissions: string[],
): void {
  if (!canViewDepartmentExecution(role, permissions)) {
    throw ApiError.forbidden('You do not have permission to view department execution');
  }
}

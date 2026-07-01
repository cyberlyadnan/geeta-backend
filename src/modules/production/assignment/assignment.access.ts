import { RoleName } from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';
import { ASSIGNMENT_PERMISSIONS } from './assignment.constants.js';
import { canViewAllDepartments } from '../queue/queue.access.js';

const ASSIGNER_ROLES: ReadonlySet<RoleName> = new Set([
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
]);

export function canAssignTasks(role: RoleName, permissions: string[]): boolean {
  if (ASSIGNER_ROLES.has(role)) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes(ASSIGNMENT_PERMISSIONS.ASSIGN)) return true;
  if (permissions.includes('production.task:*')) return true;
  if (permissions.includes('production:*')) return true;
  return false;
}

export function assertCanAssignTasks(role: RoleName, permissions: string[]): void {
  if (!canAssignTasks(role, permissions)) {
    throw ApiError.forbidden('You do not have permission to assign production tasks');
  }
}

export function canViewOperatorTasks(
  operatorId: string,
  requesterId: string,
  role: RoleName,
  permissions: string[],
): boolean {
  if (operatorId === requesterId) return true;
  return canViewAllDepartments(role, permissions) || permissions.includes(ASSIGNMENT_PERMISSIONS.VIEW_ALL);
}

export function assertCanViewOperatorTasks(
  operatorId: string,
  requesterId: string,
  role: RoleName,
  permissions: string[],
): void {
  if (!canViewOperatorTasks(operatorId, requesterId, role, permissions)) {
    throw ApiError.forbidden('You do not have permission to view these assigned tasks');
  }
}

import { RoleName } from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';
import { QC_PERMISSIONS } from './qc.constants.js';
import { canViewAllDepartments } from '../queue/queue.access.js';

const MANAGER_ROLES: ReadonlySet<RoleName> = new Set([
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
]);

export function canInspectQc(role: RoleName, permissions: string[]): boolean {
  if (MANAGER_ROLES.has(role)) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes(QC_PERMISSIONS.INSPECT)) return true;
  if (permissions.includes('production.task:*')) return true;
  if (permissions.includes('production:*')) return true;
  return false;
}

export function canViewQcMetrics(role: RoleName, permissions: string[]): boolean {
  return canViewAllDepartments(role, permissions) || permissions.includes(QC_PERMISSIONS.VIEW_ALL);
}

export function assertCanInspectQc(
  operatorId: string,
  requesterId: string,
  role: RoleName,
  permissions: string[],
): void {
  if (operatorId === requesterId && canInspectQc(role, permissions)) return;
  if (MANAGER_ROLES.has(role)) return;
  throw ApiError.forbidden('You do not have permission to perform QC inspections');
}

export function assertCanViewQcMetrics(role: RoleName, permissions: string[]): void {
  if (!canViewQcMetrics(role, permissions)) {
    throw ApiError.forbidden('You do not have permission to view QC metrics');
  }
}

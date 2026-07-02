import { RoleName } from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';
import { canViewControlCenter } from '../control-center/control-center.access.js';
import { PRODUCTION_ORDER_PERMISSIONS } from './production-order.constants.js';

const MANAGER_ROLES: ReadonlySet<RoleName> = new Set([
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
]);

export function canViewProductionOrders(role: RoleName, permissions: string[]): boolean {
  if (MANAGER_ROLES.has(role)) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes(PRODUCTION_ORDER_PERMISSIONS.ALL)) return true;
  if (permissions.includes(PRODUCTION_ORDER_PERMISSIONS.VIEW_ALL)) return true;
  if (permissions.includes(PRODUCTION_ORDER_PERMISSIONS.VIEW)) return true;
  if (permissions.includes('production:*')) return true;
  return canViewControlCenter(role, permissions);
}

export function canManageProductionOrders(role: RoleName, permissions: string[]): boolean {
  if (MANAGER_ROLES.has(role)) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes(PRODUCTION_ORDER_PERMISSIONS.ALL)) return true;
  if (permissions.includes(PRODUCTION_ORDER_PERMISSIONS.MANAGE)) return true;
  return false;
}

export function assertCanViewProductionOrders(role: RoleName, permissions: string[]): void {
  if (!canViewProductionOrders(role, permissions)) {
    throw ApiError.forbidden('You do not have permission to view production orders');
  }
}

export function assertCanManageProductionOrders(role: RoleName, permissions: string[]): void {
  if (!canManageProductionOrders(role, permissions)) {
    throw ApiError.forbidden('You do not have permission to manage production orders');
  }
}

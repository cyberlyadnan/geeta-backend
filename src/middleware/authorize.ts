import type { Request, Response, NextFunction } from 'express';
import type { RoleName } from '@prisma/client';
import { ApiError } from '../common/errors/ApiError.js';
import { ROLE_HIERARCHY } from '../constants/roles.js';

export function authorize(...allowedRoles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(ApiError.forbidden('Insufficient role permissions'));
      return;
    }

    next();
  };
}

export function authorizeMinRole(minRole: RoleName) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

    if (userLevel < requiredLevel) {
      next(ApiError.forbidden('Insufficient role level'));
      return;
    }

    next();
  };
}

export function requirePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    const userPermissions = req.user.permissions;

    if (userPermissions.includes('*')) {
      next();
      return;
    }

    const hasPermission = permissions.some(
      (p) =>
        userPermissions.includes(p) ||
        userPermissions.includes(p.split(':')[0] + ':*'),
    );

    if (!hasPermission) {
      next(ApiError.forbidden('Insufficient permissions'));
      return;
    }

    next();
  };
}

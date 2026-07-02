import { RoleName } from '@prisma/client';
import { ApiError } from '../../common/errors/ApiError.js';

export function assertSuperAdmin(role: RoleName): void {
  if (role !== RoleName.SUPER_ADMIN) {
    throw ApiError.forbidden('System administration is restricted to Super Admin');
  }
}

export function isDevelopmentEnvironment(): boolean {
  return process.env['NODE_ENV'] !== 'production';
}

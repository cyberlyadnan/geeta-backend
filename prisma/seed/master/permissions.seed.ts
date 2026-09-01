import { RoleName, type PrismaClient } from '@prisma/client';
import { createSeedLogger } from '../core/logger.js';
import { PRODUCTION_DEPARTMENTS } from './production.constants.js';

const DEPT_PERMISSIONS = PRODUCTION_DEPARTMENTS.map((d) => `production.queue.dept:${d.code}`);

const ROLE_PERMISSIONS: Record<RoleName, { displayName: string; description: string; permissions: string[] }> = {
  [RoleName.SUPER_ADMIN]: {
    displayName: 'Super Admin',
    description: 'Full system access',
    permissions: ['*'],
  },
  [RoleName.ADMIN]: {
    displayName: 'Administrator',
    description: 'Organization administrator',
    permissions: [
      'users:*',
      'orders:*',
      'reports:*',
      'vendors:*',
      'production.queue:*',
      'production.qc:*',
      'production.control:*',
      'production.machine:*',
      'production.order:*',
      'workflow:*',
    ],
  },
  [RoleName.MANAGER]: {
    displayName: 'Production Manager',
    description: 'Production manager — assign tasks, view all queues, manage workflow',
    permissions: [
      'orders:*',
      'workflow:*',
      'reports:read',
      'vendors:*',
      'production.queue:*',
      ...DEPT_PERMISSIONS,
      'production.task.assign',
      'production.task.view.all',
      'production.task.execute',
      'production.qc:*',
      'production.control:*',
      'production.machine:*',
      'production.order:*',
    ],
  },
  [RoleName.STAFF]: {
    displayName: 'Production Staff',
    description: 'Operators, QC inspectors, packing and dispatch staff',
    permissions: [
      'orders:read',
      'workflow:read',
      'production.queue.view',
      ...DEPT_PERMISSIONS,
      'production.task.view.own',
      'production.task.execute',
      'production.qc.inspect',
      'production.machine.view',
      'production.order.view',
    ],
  },
  [RoleName.SUPPORT]: {
    displayName: 'Support operator',
    description: 'Support desk — ticket queue only',
    permissions: ['support:desk'],
  },
  [RoleName.DELIVERY]: {
    displayName: 'Delivery agent',
    description: 'Delivery department — consignments on tagged services only',
    permissions: ['delivery:portal'],
  },
  [RoleName.CUSTOMER]: {
    displayName: 'Customer',
    description: 'External customer',
    permissions: ['orders:own', 'wallet:own', 'support:own'],
  },
  [RoleName.VENDOR]: {
    displayName: 'Vendor',
    description: 'External vendor / print partner',
    permissions: ['purchases:own', 'products:read', 'orders:own', 'wallet:own'],
  },
};

export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  const log = createSeedLogger('permissions');

  for (const [roleName, config] of Object.entries(ROLE_PERMISSIONS) as Array<
    [RoleName, (typeof ROLE_PERMISSIONS)[RoleName]]
  >) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {
        displayName: config.displayName,
        description: config.description,
        permissions: config.permissions,
      },
      create: {
        name: roleName,
        displayName: config.displayName,
        description: config.description,
        permissions: config.permissions,
        isSystem: true,
      },
    });
  }

  log.info(`Updated permissions for ${Object.keys(ROLE_PERMISSIONS).length} roles (${DEPT_PERMISSIONS.length} department scopes)`);
}

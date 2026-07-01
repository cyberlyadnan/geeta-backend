import { RoleName, UserStatus, type PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { SeedContext } from './types.js';
import { createSeedLogger } from './logger.js';

const ROLES = [
  {
    name: RoleName.SUPER_ADMIN,
    displayName: 'Super Admin',
    description: 'Full system access',
    permissions: ['*'],
    isSystem: true,
  },
  {
    name: RoleName.ADMIN,
    displayName: 'Administrator',
    description: 'Organization administrator',
    permissions: ['users:*', 'orders:*', 'reports:*', 'vendors:*', 'production.queue:*'],
    isSystem: true,
  },
  {
    name: RoleName.MANAGER,
    displayName: 'Manager',
    description: 'Operations manager',
    permissions: ['orders:*', 'workflow:*', 'reports:read', 'vendors:*', 'production.queue:*'],
    isSystem: true,
  },
  {
    name: RoleName.STAFF,
    displayName: 'Staff',
    description: 'Internal staff member',
    permissions: [
      'orders:read',
      'orders:update',
      'workflow:*',
      'production.queue.view',
      'production.queue.dept:ARTWORK',
      'production.queue.dept:PRINT',
      'production.queue.dept:QC',
      'production.queue.dept:PACKING',
      'production.queue.dept:DISPATCH',
    ],
    isSystem: true,
  },
  {
    name: RoleName.CUSTOMER,
    displayName: 'Customer',
    description: 'External customer',
    permissions: ['orders:own', 'wallet:own', 'support:own'],
    isSystem: true,
  },
  {
    name: RoleName.VENDOR,
    displayName: 'Vendor',
    description: 'External vendor / print partner',
    permissions: ['purchases:own', 'products:read'],
    isSystem: true,
  },
] as const;

export async function seedRolesAndAdmin(prisma: PrismaClient): Promise<string | undefined> {
  const log = createSeedLogger('roles');

  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {
        displayName: role.displayName,
        description: role.description,
        permissions: role.permissions,
      },
      create: { ...role },
    });
  }
  log.info(`Upserted ${ROLES.length} system roles`);

  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@geetaprint.com';
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'Admin@12345';
  const superAdminPhone = process.env.SEED_SUPER_ADMIN_PHONE ?? '9999999999';

  const superAdminRole = await prisma.role.findUnique({ where: { name: RoleName.SUPER_ADMIN } });
  if (!superAdminRole) return undefined;

  const passwordHash = await bcrypt.hash(superAdminPassword, 12);
  const user = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      phone: superAdminPhone,
      roleId: superAdminRole.id,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: superAdminEmail,
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      phone: superAdminPhone,
      roleId: superAdminRole.id,
      status: UserStatus.ACTIVE,
    },
  });

  log.info(`Super admin ready: ${superAdminEmail}`);
  return user.id;
}

export async function seedRolesModule(ctx: SeedContext): Promise<void> {
  ctx.actorId = await seedRolesAndAdmin(ctx.prisma);
}

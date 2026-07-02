import { RoleName, UserStatus, type PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createSeedLogger } from './logger.js';
import { seedPermissions } from '../master/permissions.seed.js';

export async function seedRolesAndAdmin(prisma: PrismaClient): Promise<string | undefined> {
  const log = createSeedLogger('roles');

  await seedPermissions(prisma);

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

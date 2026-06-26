import { PrismaClient, RoleName, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedPrintMasters } from './seed-print-masters.js';

const prisma = new PrismaClient();

const ROLES: Array<{
  name: RoleName;
  displayName: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
}> = [
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
    permissions: ['users:*', 'orders:*', 'reports:*', 'vendors:*'],
    isSystem: true,
  },
  {
    name: RoleName.MANAGER,
    displayName: 'Manager',
    description: 'Operations manager',
    permissions: ['orders:*', 'workflow:*', 'reports:read', 'vendors:*'],
    isSystem: true,
  },
  {
    name: RoleName.STAFF,
    displayName: 'Staff',
    description: 'Internal staff member',
    permissions: ['orders:read', 'orders:update', 'workflow:*'],
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
    description: 'External vendor/supplier',
    permissions: ['purchases:own', 'products:read'],
    isSystem: true,
  },
];

async function main(): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {
        displayName: role.displayName,
        description: role.description,
        permissions: role.permissions,
      },
      create: role,
    });
  }

  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@geetaprint.com';
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'Admin@12345';
  const superAdminPhone = process.env.SEED_SUPER_ADMIN_PHONE ?? '9999999999';

  const superAdminRole = await prisma.role.findUnique({
    where: { name: RoleName.SUPER_ADMIN },
  });

  if (superAdminRole) {
    const passwordHash = await bcrypt.hash(superAdminPassword, 12);
    await prisma.user.upsert({
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
    console.log(`Super admin ready: ${superAdminEmail} (phone login: ${superAdminPhone})`);
  }

  console.log('Seed completed: roles initialized');

  await seedPrintMasters(prisma);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

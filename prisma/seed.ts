import { PrismaClient, RoleName } from '@prisma/client';

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
    permissions: ['users:*', 'orders:*', 'reports:*'],
    isSystem: true,
  },
  {
    name: RoleName.MANAGER,
    displayName: 'Manager',
    description: 'Operations manager',
    permissions: ['orders:*', 'workflow:*', 'reports:read'],
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

  console.log('Seed completed: roles initialized');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

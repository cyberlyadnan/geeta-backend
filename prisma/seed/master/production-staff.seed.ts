import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';
import { RoleName, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const OPERATOR_EMAIL = process.env.SEED_OPERATOR_EMAIL ?? 'operator@geetaprint.com';
const OPERATOR_PASSWORD = process.env.SEED_OPERATOR_PASSWORD ?? 'Operator@12345';

export async function seedProductionStaff(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('production-staff');
  const { prisma, actorId } = ctx;

  const staffRole = await prisma.role.findUnique({ where: { name: RoleName.STAFF } });
  if (!staffRole) {
    log.warn('STAFF role missing — skip production staff seed');
    return;
  }

  const passwordHash = await bcrypt.hash(OPERATOR_PASSWORD, 12);
  const operator = await prisma.user.upsert({
    where: { email: OPERATOR_EMAIL },
    update: {
      passwordHash,
      firstName: 'Production',
      lastName: 'Operator',
      roleId: staffRole.id,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: OPERATOR_EMAIL,
      passwordHash,
      firstName: 'Production',
      lastName: 'Operator',
      phone: process.env.SEED_OPERATOR_PHONE ?? '9999999991',
      roleId: staffRole.id,
      status: UserStatus.ACTIVE,
    },
  });

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
  });

  for (const dept of departments) {
    await prisma.userDepartmentAssignment.upsert({
      where: {
        userId_departmentId: { userId: operator.id, departmentId: dept.id },
      },
      update: { isActive: true, roleCode: 'OPERATOR', assignedById: actorId },
      create: {
        userId: operator.id,
        departmentId: dept.id,
        roleCode: 'OPERATOR',
        isPrimary: dept.code === 'ARTWORK',
        assignedById: actorId,
      },
    });
  }

  if (actorId) {
    for (const dept of departments.slice(0, 2)) {
      await prisma.userDepartmentAssignment.upsert({
        where: {
          userId_departmentId: { userId: actorId, departmentId: dept.id },
        },
        update: { isActive: true, roleCode: 'SUPERVISOR' },
        create: {
          userId: actorId,
          departmentId: dept.id,
          roleCode: 'SUPERVISOR',
          isPrimary: false,
          assignedById: actorId,
        },
      });
    }
  }

  log.info(`Production staff seeded: operator=${OPERATOR_EMAIL}, departments=${departments.length}`);
}

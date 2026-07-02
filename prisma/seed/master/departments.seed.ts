import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';
import { FACILITY_CODE, PRODUCTION_DEPARTMENTS } from './production.constants.js';

export async function seedDepartments(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('departments');
  const { prisma, registry } = ctx;

  log.info('Seeding production facility and departments...');

  const facility = await prisma.facility.upsert({
    where: { code: FACILITY_CODE },
    update: {
      name: 'Geeta Print Main Facility',
      address: 'Plot 12, Industrial Estate, Ahmedabad, Gujarat',
      isActive: true,
    },
    create: {
      name: 'Geeta Print Main Facility',
      code: FACILITY_CODE,
      address: 'Plot 12, Industrial Estate, Ahmedabad, Gujarat',
      isActive: true,
    },
  });

  registry.facilityId = facility.id;
  registry.departments.clear();

  for (const dept of PRODUCTION_DEPARTMENTS) {
    const record = await prisma.department.upsert({
      where: { code: dept.code },
      update: {
        name: dept.name,
        description: `${dept.description} | UI Color: ${dept.color}`,
        sortOrder: dept.sortOrder,
        facilityId: facility.id,
        isActive: true,
      },
      create: {
        facilityId: facility.id,
        name: dept.name,
        code: dept.code,
        description: `${dept.description} | UI Color: ${dept.color}`,
        sortOrder: dept.sortOrder,
        isActive: true,
      },
    });
    registry.departments.set(dept.code, record.id);
  }

  log.info(`Seeded facility ${FACILITY_CODE} with ${PRODUCTION_DEPARTMENTS.length} departments`);
}

import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { FACILITY_CODE } from '../../../prisma/seed/master/production.constants.js';

/** Ensures a production facility exists after a full DB reset (manual ERP bootstrap). */
export async function ensureDefaultFacility() {
  return prisma.facility.upsert({
    where: { code: FACILITY_CODE },
    update: {
      name: 'Geeta Print Main Facility',
      isActive: true,
    },
    create: {
      code: FACILITY_CODE,
      name: 'Geeta Print Main Facility',
      address: 'Main production facility',
      isActive: true,
    },
  });
}

export async function resolveFacilityId(facilityId?: string | null): Promise<string> {
  if (facilityId) {
    const existing = await prisma.facility.findUnique({
      where: { id: facilityId },
      select: { id: true },
    });
    if (!existing) {
      throw ApiError.notFound('Facility not found');
    }
    return existing.id;
  }
  const facility = await ensureDefaultFacility();
  return facility.id;
}

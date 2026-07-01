import { MachineOperationalStatus, MachineStatus } from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

const FACILITY_CODE = 'GEETA-MAIN';

const SAMPLE_MACHINES = [
  {
    machineCode: 'PRT-001',
    machineName: 'Offset Press Alpha',
    departmentCode: 'PRINT',
    machineType: 'OFFSET_PRESS',
    manufacturer: 'Heidelberg',
    model: 'Speedmaster XL 75',
    capabilities: ['OFFSET', 'CMYK', 'SPOT_COLOR'],
    supportedProcesses: ['OFFSET_PRINT'],
    maxSheetWidthMm: 750,
    maxSheetHeightMm: 550,
    maxPrintWidthMm: 720,
    maxPrintHeightMm: 520,
    capacityPerHour: 1200,
    speedRating: 'High',
    averageRuntimeMinutes: 45,
    operationalStatus: MachineOperationalStatus.AVAILABLE,
  },
  {
    machineCode: 'PRT-002',
    machineName: 'Digital Press Beta',
    departmentCode: 'PRINT',
    machineType: 'DIGITAL_PRESS',
    manufacturer: 'HP',
    model: 'Indigo 7900',
    capabilities: ['DIGITAL', 'VARIABLE_DATA'],
    supportedProcesses: ['DIGITAL_PRINT'],
    maxSheetWidthMm: 500,
    maxSheetHeightMm: 700,
    maxPrintWidthMm: 480,
    maxPrintHeightMm: 680,
    capacityPerHour: 800,
    speedRating: 'Medium',
    averageRuntimeMinutes: 30,
    operationalStatus: MachineOperationalStatus.AVAILABLE,
  },
  {
    machineCode: 'PRT-003',
    machineName: 'Large Format Gamma',
    departmentCode: 'PRINT',
    machineType: 'LARGE_FORMAT',
    manufacturer: 'Epson',
    model: 'SureColor S80600',
    capabilities: ['LARGE_FORMAT', 'VINYL', 'BANNER'],
    supportedProcesses: ['LARGE_FORMAT_PRINT'],
    maxSheetWidthMm: 1600,
    maxSheetHeightMm: 3200,
    capacityPerHour: 40,
    speedRating: 'Variable',
    operationalStatus: MachineOperationalStatus.MAINTENANCE,
  },
] as const;

export async function seedProductionMachines(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('production-machines');
  const { prisma } = ctx;

  const facility = await prisma.facility.findUnique({ where: { code: FACILITY_CODE } });
  if (!facility) {
    log.warn('Facility not found — skip machine seed (run production-workflow seed first)');
    return;
  }

  const departments = await prisma.department.findMany({
    where: { facilityId: facility.id, isActive: true },
    select: { id: true, code: true },
  });
  const deptByCode = new Map(departments.map((d) => [d.code, d.id]));

  let count = 0;
  for (const machine of SAMPLE_MACHINES) {
    const departmentId = deptByCode.get(machine.departmentCode);
    if (!departmentId) {
      log.warn(`Department ${machine.departmentCode} not found — skipping ${machine.machineCode}`);
      continue;
    }

    await prisma.machine.upsert({
      where: { machineCode: machine.machineCode },
      update: {
        machineName: machine.machineName,
        departmentId,
        facilityId: facility.id,
        machineType: machine.machineType,
        manufacturer: machine.manufacturer,
        model: machine.model,
        capabilities: [...machine.capabilities],
        supportedProcesses: [...machine.supportedProcesses],
        maxSheetWidthMm: machine.maxSheetWidthMm,
        maxSheetHeightMm: machine.maxSheetHeightMm,
        maxPrintWidthMm: 'maxPrintWidthMm' in machine ? machine.maxPrintWidthMm : undefined,
        maxPrintHeightMm: 'maxPrintHeightMm' in machine ? machine.maxPrintHeightMm : undefined,
        capacityPerHour: machine.capacityPerHour,
        speedRating: machine.speedRating,
        averageRuntimeMinutes: 'averageRuntimeMinutes' in machine ? machine.averageRuntimeMinutes : undefined,
        operationalStatus: machine.operationalStatus,
        isActive: true,
        status: MachineStatus.ACTIVE,
        workingHours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 4, sun: 0 },
      },
      create: {
        facilityId: facility.id,
        departmentId,
        machineCode: machine.machineCode,
        machineName: machine.machineName,
        machineType: machine.machineType,
        manufacturer: machine.manufacturer,
        model: machine.model,
        capabilities: [...machine.capabilities],
        supportedProcesses: [...machine.supportedProcesses],
        maxSheetWidthMm: machine.maxSheetWidthMm,
        maxSheetHeightMm: machine.maxSheetHeightMm,
        maxPrintWidthMm: 'maxPrintWidthMm' in machine ? machine.maxPrintWidthMm : undefined,
        maxPrintHeightMm: 'maxPrintHeightMm' in machine ? machine.maxPrintHeightMm : undefined,
        capacityPerHour: machine.capacityPerHour,
        speedRating: machine.speedRating,
        averageRuntimeMinutes: 'averageRuntimeMinutes' in machine ? machine.averageRuntimeMinutes : undefined,
        operationalStatus: machine.operationalStatus,
        isActive: true,
        status: MachineStatus.ACTIVE,
        workingHours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 4, sun: 0 },
      },
    });
    count += 1;
  }

  log.info(`Upserted ${count} sample production machines`);
}

import { MachineOperationalStatus, MachineStatus } from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';
import { FACILITY_CODE } from './production.constants.js';

const MACHINES = [
  {
    machineCode: 'DIG-001',
    machineName: 'HP Indigo 7900',
    departmentCode: 'DIGITAL_PRINT',
    machineType: 'DIGITAL_PRESS',
    manufacturer: 'HP',
    model: 'Indigo 7900',
    capabilities: ['DIGITAL', 'VARIABLE_DATA', 'CARDS'],
    supportedProcesses: ['DIGITAL_PRINT'],
    maxSheetWidthMm: 500,
    maxSheetHeightMm: 700,
    capacityPerHour: 800,
    averageRuntimeMinutes: 35,
    operationalStatus: MachineOperationalStatus.AVAILABLE,
  },
  {
    machineCode: 'DIG-002',
    machineName: 'Konica Minolta AccurioPress C14000',
    departmentCode: 'DIGITAL_PRINT',
    machineType: 'DIGITAL_PRESS',
    manufacturer: 'Konica Minolta',
    model: 'AccurioPress C14000',
    capabilities: ['DIGITAL', 'HIGH_VOLUME'],
    supportedProcesses: ['DIGITAL_PRINT'],
    maxSheetWidthMm: 330,
    maxSheetHeightMm: 488,
    capacityPerHour: 1200,
    averageRuntimeMinutes: 25,
    operationalStatus: MachineOperationalStatus.AVAILABLE,
  },
  {
    machineCode: 'DIG-003',
    machineName: 'Canon imagePRESS C10000',
    departmentCode: 'DIGITAL_PRINT',
    machineType: 'DIGITAL_PRESS',
    manufacturer: 'Canon',
    model: 'imagePRESS C10000',
    capabilities: ['DIGITAL', 'BROCHURES'],
    supportedProcesses: ['DIGITAL_PRINT'],
    maxSheetWidthMm: 330,
    maxSheetHeightMm: 1200,
    capacityPerHour: 900,
    averageRuntimeMinutes: 30,
    operationalStatus: MachineOperationalStatus.AVAILABLE,
  },
  {
    machineCode: 'OFS-001',
    machineName: 'Komori Lithrone G40',
    departmentCode: 'OFFSET_PRINT',
    machineType: 'OFFSET_PRESS',
    manufacturer: 'Komori',
    model: 'Lithrone G40',
    capabilities: ['OFFSET', 'CMYK', 'SPOT_COLOR'],
    supportedProcesses: ['OFFSET_PRINT'],
    maxSheetWidthMm: 720,
    maxSheetHeightMm: 1030,
    capacityPerHour: 6000,
    averageRuntimeMinutes: 90,
    operationalStatus: MachineOperationalStatus.AVAILABLE,
  },
  {
    machineCode: 'UV-001',
    machineName: 'Roland VersaUV LEF2-300',
    departmentCode: 'UV_PRINT',
    machineType: 'UV_PRINTER',
    manufacturer: 'Roland',
    model: 'VersaUV LEF2-300',
    capabilities: ['UV', 'SPOT_UV', 'ACRYLIC'],
    supportedProcesses: ['UV_PRINT'],
    maxSheetWidthMm: 300,
    maxSheetHeightMm: 300,
    capacityPerHour: 120,
    averageRuntimeMinutes: 45,
    operationalStatus: MachineOperationalStatus.AVAILABLE,
  },
  {
    machineCode: 'LF-001',
    machineName: 'Mimaki UCJV300-160',
    departmentCode: 'DIGITAL_PRINT',
    machineType: 'LARGE_FORMAT',
    manufacturer: 'Mimaki',
    model: 'UCJV300-160',
    capabilities: ['LARGE_FORMAT', 'FLEX', 'VINYL', 'UV'],
    supportedProcesses: ['LARGE_FORMAT_PRINT', 'FLEX_PRINT'],
    maxSheetWidthMm: 1600,
    maxSheetHeightMm: 5000,
    capacityPerHour: 45,
    averageRuntimeMinutes: 120,
    operationalStatus: MachineOperationalStatus.BUSY,
  },
  {
    machineCode: 'FOIL-001',
    machineName: 'Heidelberg Speedmaster Foiler',
    departmentCode: 'FOILING',
    machineType: 'FOIL_STAMPER',
    manufacturer: 'Heidelberg',
    model: 'Speedmaster Foiler',
    capabilities: ['FOILING', 'HOT_FOIL'],
    supportedProcesses: ['FOILING'],
    maxSheetWidthMm: 520,
    maxSheetHeightMm: 740,
    capacityPerHour: 400,
    averageRuntimeMinutes: 40,
    operationalStatus: MachineOperationalStatus.AVAILABLE,
  },
  {
    machineCode: 'LAM-001',
    machineName: 'Komfi Amiga 52',
    departmentCode: 'LAMINATION',
    machineType: 'LAMINATOR',
    manufacturer: 'Komfi',
    model: 'Amiga 52',
    capabilities: ['LAMINATION', 'MATT', 'GLOSS'],
    supportedProcesses: ['LAMINATION'],
    maxSheetWidthMm: 520,
    maxSheetHeightMm: 740,
    capacityPerHour: 600,
    averageRuntimeMinutes: 20,
    operationalStatus: MachineOperationalStatus.AVAILABLE,
  },
  {
    machineCode: 'CUT-001',
    machineName: 'Bobst Novacut 106',
    departmentCode: 'CUTTING',
    machineType: 'DIE_CUTTER',
    manufacturer: 'Bobst',
    model: 'Novacut 106',
    capabilities: ['DIE_CUT', 'CREASING'],
    supportedProcesses: ['DIE_CUT'],
    maxSheetWidthMm: 760,
    maxSheetHeightMm: 1060,
    capacityPerHour: 300,
    averageRuntimeMinutes: 55,
    operationalStatus: MachineOperationalStatus.AVAILABLE,
  },
] as const;

export async function seedMachines(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('machines');
  const { prisma, registry } = ctx;

  const facilityId = registry.facilityId;
  if (!facilityId) {
    log.warn('Facility missing — skip machines seed');
    return;
  }

  let count = 0;
  for (const machine of MACHINES) {
    const departmentId = registry.departments.get(machine.departmentCode);
    if (!departmentId) {
      log.warn(`Department ${machine.departmentCode} missing — skip ${machine.machineCode}`);
      continue;
    }

    await prisma.machine.upsert({
      where: { machineCode: machine.machineCode },
      update: {
        machineName: machine.machineName,
        departmentId,
        facilityId,
        machineType: machine.machineType,
        manufacturer: machine.manufacturer,
        model: machine.model,
        capabilities: [...machine.capabilities],
        supportedProcesses: [...machine.supportedProcesses],
        maxSheetWidthMm: machine.maxSheetWidthMm,
        maxSheetHeightMm: machine.maxSheetHeightMm,
        capacityPerHour: machine.capacityPerHour,
        averageRuntimeMinutes: machine.averageRuntimeMinutes,
        operationalStatus: machine.operationalStatus,
        isActive: true,
        status: MachineStatus.ACTIVE,
        workingHours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 4, sun: 0 },
      },
      create: {
        facilityId,
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
        capacityPerHour: machine.capacityPerHour,
        averageRuntimeMinutes: machine.averageRuntimeMinutes,
        operationalStatus: machine.operationalStatus,
        isActive: true,
        status: MachineStatus.ACTIVE,
        workingHours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 4, sun: 0 },
      },
    });
    count += 1;
  }

  log.info(`Upserted ${count} production machines`);
}

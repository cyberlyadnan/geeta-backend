import type { MachineDetailRecord } from './machine.repository.js';

function decimalToNumber(value: { toNumber(): number } | null | undefined) {
  return value ? value.toNumber() : null;
}

export function mapMachineToDto(record: MachineDetailRecord) {
  return {
    id: record.id,
    facilityId: record.facilityId,
    departmentId: record.departmentId,
    machineCode: record.machineCode,
    machineName: record.machineName,
    machineType: record.machineType,
    manufacturer: record.manufacturer,
    model: record.model,
    capabilities: record.capabilities as string[],
    supportedProcesses: record.supportedProcesses as string[],
    minSheetSize: {
      widthMm: decimalToNumber(record.minSheetWidthMm),
      heightMm: decimalToNumber(record.minSheetHeightMm),
    },
    maxSheetSize: {
      widthMm: decimalToNumber(record.maxSheetWidthMm),
      heightMm: decimalToNumber(record.maxSheetHeightMm),
    },
    maxPrintArea: {
      widthMm: decimalToNumber(record.maxPrintWidthMm),
      heightMm: decimalToNumber(record.maxPrintHeightMm),
    },
    speedRating: record.speedRating,
    capacityPerHour: record.capacityPerHour,
    workingHours: record.workingHours,
    averageRuntimeMinutes: record.averageRuntimeMinutes,
    supportedProductIds: record.supportedProductIds as string[],
    operationalStatus: record.operationalStatus,
    isActive: record.isActive,
    notes: record.notes,
    metadata: record.metadata,
    department: record.department,
    facility: record.facility,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function mapMachineListItem(
  record: {
    id: string;
    machineCode: string;
    machineName: string;
    machineType: string | null;
    departmentId: string;
    operationalStatus: string;
    isActive: boolean;
    capacityPerHour: number | null;
    manufacturer: string | null;
    model: string | null;
    department: { id: string; code: string; name: string };
  },
) {
  return {
    id: record.id,
    machineCode: record.machineCode,
    machineName: record.machineName,
    machineType: record.machineType,
    departmentId: record.departmentId,
    operationalStatus: record.operationalStatus,
    isActive: record.isActive,
    capacityPerHour: record.capacityPerHour,
    manufacturer: record.manufacturer,
    model: record.model,
    department: record.department,
  };
}

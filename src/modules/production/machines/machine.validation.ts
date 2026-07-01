import { z } from 'zod';
import { MachineOperationalStatus } from '@prisma/client';

const decimalField = z.coerce.number().positive().optional();

export const machineIdParamSchema = z.object({ machineId: z.string().cuid() });

export const listMachinesQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  departmentId: z.string().cuid().optional(),
  facilityId: z.string().cuid().optional(),
  operationalStatus: z.nativeEnum(MachineOperationalStatus).optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
});

export const createMachineSchema = z.object({
  facilityId: z.string().cuid().optional(),
  departmentId: z.string().cuid(),
  machineCode: z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/i),
  machineName: z.string().min(1).max(200),
  machineType: z.string().max(100).optional(),
  manufacturer: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  capabilities: z.array(z.string().max(100)).default([]),
  supportedProcesses: z.array(z.string().max(100)).default([]),
  minSheetWidthMm: decimalField,
  minSheetHeightMm: decimalField,
  maxSheetWidthMm: decimalField,
  maxSheetHeightMm: decimalField,
  maxPrintWidthMm: decimalField,
  maxPrintHeightMm: decimalField,
  speedRating: z.string().max(100).optional(),
  capacityPerHour: z.coerce.number().int().positive().optional(),
  workingHours: z.record(z.unknown()).optional(),
  averageRuntimeMinutes: z.coerce.number().int().positive().optional(),
  supportedProductIds: z.array(z.string().cuid()).default([]),
  operationalStatus: z.nativeEnum(MachineOperationalStatus).default('AVAILABLE'),
  notes: z.string().max(5000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateMachineSchema = createMachineSchema
  .partial()
  .omit({ facilityId: true, machineCode: true })
  .extend({
    machineName: z.string().min(1).max(200).optional(),
  });

export const changeMachineStatusSchema = z.object({
  operationalStatus: z.nativeEnum(MachineOperationalStatus),
  reason: z.string().max(2000).optional(),
});

export const addMaintenanceSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
});

export type CreateMachineBody = z.infer<typeof createMachineSchema>;
export type UpdateMachineBody = z.infer<typeof updateMachineSchema>;
export type ListMachinesQuery = z.infer<typeof listMachinesQuerySchema>;
export type ChangeMachineStatusBody = z.infer<typeof changeMachineStatusSchema>;
export type AddMaintenanceBody = z.infer<typeof addMaintenanceSchema>;

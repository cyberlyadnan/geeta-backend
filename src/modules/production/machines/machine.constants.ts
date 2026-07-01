export const MACHINE_CACHE_PREFIX = 'production-machines:';
export const MACHINE_LIST_TTL_SEC = 30;
export const MACHINE_OVERVIEW_TTL_SEC = 20;

export const MACHINE_PERMISSIONS = {
  VIEW: 'production.machine.view',
  MANAGE: 'production.machine.manage',
  ALL: 'production.machine:*',
} as const;

export const ASSIGNABLE_MACHINE_STATUSES = ['AVAILABLE', 'RESERVED'] as const;

export const MACHINE_LIST_SELECT_FIELDS = [
  'id',
  'machineCode',
  'machineName',
  'machineType',
  'departmentId',
  'operationalStatus',
  'isActive',
  'capacityPerHour',
] as const;

import type { PrismaClient } from '@prisma/client';
import type { SeedLogger } from './logger.js';

/** Code → database id maps populated as masters seed runs */
export interface MasterRegistry {
  units: Map<string, string>;
  sheetSizes: Map<string, string>;
  sizeTemplates: Map<string, string>;
  printProcesses: Map<string, string>;
  printSpecifications: Map<string, string>;
  artworkRules: Map<string, string>;
  validationRules: Map<string, string>;
  coverageRules: Map<string, string>;
  fileUploadRules: Map<string, string>;
  categories: Map<string, string>;
  families: Map<string, string>;
  series: Map<string, string>;
  /** Production ERP master data */
  facilityId?: string;
  departments: Map<string, string>;
  workflowTemplates: Map<string, string>;
}

export function createEmptyRegistry(): MasterRegistry {
  return {
    units: new Map(),
    sheetSizes: new Map(),
    sizeTemplates: new Map(),
    printProcesses: new Map(),
    printSpecifications: new Map(),
    artworkRules: new Map(),
    validationRules: new Map(),
    coverageRules: new Map(),
    fileUploadRules: new Map(),
    categories: new Map(),
    families: new Map(),
    series: new Map(),
    departments: new Map(),
    workflowTemplates: new Map(),
  };
}

export interface SeedContext {
  prisma: PrismaClient;
  registry: MasterRegistry;
  log: SeedLogger;
  /** Super admin user id when available (audit fields) */
  actorId?: string;
}

export type SeedModule = (ctx: SeedContext) => Promise<void>;

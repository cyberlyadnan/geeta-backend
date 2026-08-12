import { z } from 'zod';
import { DepartmentStaffRole, RoleName, UserStatus, WorkflowStepType } from '@prisma/client';

export const cursorQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).optional(),
});

export const idParamSchema = z.object({ id: z.string().cuid() });

export const listSystemUsersQuerySchema = cursorQuerySchema.extend({
  role: z.nativeEnum(RoleName).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  departmentId: z.string().cuid().optional(),
});

export const createSystemUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(20).optional(),
  roleName: z.nativeEnum(RoleName),
  status: z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
  departmentAssignments: z
    .array(
      z.object({
        departmentId: z.string().cuid(),
        roleCode: z.nativeEnum(DepartmentStaffRole).default(DepartmentStaffRole.OPERATOR),
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const updateSystemUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).nullable().optional(),
  roleName: z.nativeEnum(RoleName).optional(),
  status: z.nativeEnum(UserStatus).optional(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export const assignDepartmentsSchema = z.object({
  assignments: z.array(
    z.object({
      departmentId: z.string().cuid(),
      roleCode: z.nativeEnum(DepartmentStaffRole),
      isPrimary: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }),
  ),
});

export type AssignDepartmentsInput = z.infer<typeof assignDepartmentsSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateRolePermissionsSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().min(1).max(120)),
});

export const createDepartmentSchema = z.object({
  facilityId: z.string().cuid().optional(),
  name: z.string().min(1).max(120),
  code: z.string().min(2).max(40).regex(/^[A-Z0-9_]+$/),
  description: z.string().max(2000).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateDepartmentSchema = createDepartmentSchema.partial().omit({ code: true });

export const createWorkflowTemplateSchema = z.object({
  facilityId: z.string().cuid().optional(),
  name: z.string().min(1).max(200),
  code: z
    .string()
    .min(2)
    .max(60)
    .regex(/^WF-[A-Z0-9_-]+$/, 'Code must start with WF- and use only uppercase letters, numbers, underscores, or hyphens'),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean().optional(),
});

export const updateWorkflowTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  isDefault: z.boolean().optional(),
});

export const workflowStepSchema = z.object({
  id: z.string().cuid().optional(),
  departmentId: z.string().cuid(),
  stepName: z.string().min(1).max(200),
  stepCode: z.string().min(1).max(80),
  // Derived from the Prisma enum rather than re-listed, so a new step type (e.g. Phase 4's
  // VENDOR_APPROVAL) cannot be silently rejected by a stale copy of the list.
  stepType: z.nativeEnum(WorkflowStepType),
  stepOrder: z.coerce.number().int().min(1),
  expectedMinutes: z.coerce.number().int().min(1),
  allowRework: z.boolean().optional(),
  allowSkip: z.boolean().optional(),
  isMandatory: z.boolean().optional(),
  /** Order amendments are blocked once a task for this step leaves the not-yet-started statuses. */
  locksAmendmentsOnStart: z.boolean().optional(),
  instructions: z.string().max(5000).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  skipWhen: z
    .union([
      z.object({
        field: z.string().min(1).max(80),
        operator: z.enum(['in', 'eq', 'not_in', 'neq', 'empty', 'not_empty']),
        values: z.array(z.string()).optional(),
      }),
      z.array(
        z.object({
          field: z.string().min(1).max(80),
          operator: z.enum(['in', 'eq', 'not_in', 'neq', 'empty', 'not_empty']),
          values: z.array(z.string()).optional(),
        }),
      ),
    ])
    .nullable()
    .optional(),
  sla: z
    .object({
      warningAfterMinutes: z.coerce.number().int().min(1),
      criticalAfterMinutes: z.coerce.number().int().min(1),
    })
    .optional(),
  dependsOnStepIds: z.array(z.string().cuid()).optional(),
});

export const saveWorkflowStepsSchema = z.object({
  steps: z.array(workflowStepSchema).min(1),
});

export const linkProductWorkflowSchema = z.object({
  productOfferingVersionId: z.string().cuid(),
  workflowTemplateId: z.string().cuid(),
  isDefault: z.boolean().default(true),
});

export const createQcTemplateSchema = z.object({
  code: z.string().min(2).max(60),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  workflowTemplateStepId: z.string().cuid().optional(),
  productOfferingVersionId: z.string().cuid().optional(),
  isActive: z.boolean().default(true),
  items: z
    .array(
      z.object({
        itemCode: z.string().min(1).max(80),
        label: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        sortOrder: z.coerce.number().int().min(0),
        isRequired: z.boolean().default(true),
      }),
    )
    .optional(),
});

export const runSeedSchema = z.object({
  scope: z.enum(['all', 'roles', 'master', 'products', 'pricing', 'orders']).default('master'),
});

export type ListSystemUsersQuery = z.infer<typeof listSystemUsersQuerySchema>;
export type SaveWorkflowStepsInput = z.infer<typeof saveWorkflowStepsSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type CursorQuery = z.infer<typeof cursorQuerySchema>;
export type CreateSystemUserInput = z.infer<typeof createSystemUserSchema>;
export type UpdateSystemUserInput = z.infer<typeof updateSystemUserSchema>;
export type CreateWorkflowTemplateInput = z.infer<typeof createWorkflowTemplateSchema>;
export type UpdateWorkflowTemplateInput = z.infer<typeof updateWorkflowTemplateSchema>;
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
export type LinkProductWorkflowInput = z.infer<typeof linkProductWorkflowSchema>;
export type CreateQcTemplateInput = z.infer<typeof createQcTemplateSchema>;

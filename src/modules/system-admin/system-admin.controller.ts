import type { Request, Response } from 'express';
import { RoleName } from '@prisma/client';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { assertSuperAdmin } from './system-admin.access.js';
import { systemUsersService } from './system-users.service.js';
import { systemRolesService } from './system-roles.service.js';
import { systemDepartmentsService } from './system-departments.service.js';
import { systemWorkflowsService } from './system-workflows.service.js';
import { systemProductWorkflowsService } from './system-product-workflows.service.js';
import { systemQcService } from './system-qc.service.js';
import { systemValidatorService } from './system-validator.service.js';
import { systemDebugService } from './system-debug.service.js';
import { systemSeedService } from './system-seed.service.js';
import { systemHealthService } from './system-health.service.js';

function requireSuperAdmin(req: Request) {
  assertSuperAdmin(req.user!.role as RoleName);
  return req.user!.id;
}

export class SystemAdminController {
  // Users
  listUsers = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemUsersService.list(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  getUser = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemUsersService.getById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  createUser = asyncHandler(async (req: Request, res: Response) => {
    const actorId = requireSuperAdmin(req);
    const result = await systemUsersService.create(req.body, actorId);
    return ApiResponse.created(res, result);
  });

  updateUser = asyncHandler(async (req: Request, res: Response) => {
    const actorId = requireSuperAdmin(req);
    const result = await systemUsersService.update(req.params['id'] as string, req.body, actorId);
    return ApiResponse.success(res, result);
  });

  deactivateUser = asyncHandler(async (req: Request, res: Response) => {
    const actorId = requireSuperAdmin(req);
    const result = await systemUsersService.deactivate(req.params['id'] as string, actorId);
    return ApiResponse.success(res, result);
  });

  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const actorId = requireSuperAdmin(req);
    const result = await systemUsersService.resetPassword(req.params['id'] as string, req.body, actorId);
    return ApiResponse.success(res, result);
  });

  assignDepartments = asyncHandler(async (req: Request, res: Response) => {
    const actorId = requireSuperAdmin(req);
    const result = await systemUsersService.assignDepartments(req.params['id'] as string, req.body, actorId);
    return ApiResponse.success(res, result);
  });

  // Roles
  listRoles = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemRolesService.list();
    return ApiResponse.success(res, result);
  });

  permissionMatrix = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemRolesService.getPermissionMatrix();
    return ApiResponse.success(res, result);
  });

  updateRole = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemRolesService.update(req.params['id'] as string, req.body);
    return ApiResponse.success(res, result);
  });

  // Departments
  listDepartments = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemDepartmentsService.list(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  getDepartment = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemDepartmentsService.getById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  createDepartment = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemDepartmentsService.create(req.body);
    return ApiResponse.created(res, result);
  });

  updateDepartment = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemDepartmentsService.update(req.params['id'] as string, req.body);
    return ApiResponse.success(res, result);
  });

  // Workflows
  listWorkflows = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemWorkflowsService.list(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  getWorkflow = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemWorkflowsService.getById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  createWorkflow = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemWorkflowsService.create(req.body);
    return ApiResponse.created(res, result);
  });

  updateWorkflow = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemWorkflowsService.update(req.params['id'] as string, req.body);
    return ApiResponse.success(res, result);
  });

  duplicateWorkflow = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const { newCode, newName } = req.body as { newCode: string; newName: string };
    const result = await systemWorkflowsService.duplicate(req.params['id'] as string, newCode, newName);
    return ApiResponse.created(res, result);
  });

  archiveWorkflow = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemWorkflowsService.archive(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  saveWorkflowSteps = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemWorkflowsService.saveSteps(req.params['id'] as string, req.body);
    return ApiResponse.success(res, result);
  });

  // Product workflows
  listProductWorkflows = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemProductWorkflowsService.list(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  linkProductWorkflow = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemProductWorkflowsService.link(req.body);
    return ApiResponse.success(res, result);
  });

  // QC
  listQcTemplates = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemQcService.listTemplates(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  getQcTemplate = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemQcService.getTemplate(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  upsertQcTemplate = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemQcService.upsertTemplate(req.body);
    return ApiResponse.created(res, result);
  });

  // Validator
  runValidator = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemValidatorService.run();
    return ApiResponse.success(res, result);
  });

  // Debug
  debugOverview = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemDebugService.overview();
    return ApiResponse.success(res, result);
  });

  debugEntity = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemDebugService.listEntities(
      req.params['entity'] as never,
      req.validatedQuery as never,
    );
    return ApiResponse.success(res, result);
  });

  // Seed
  runSeed = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemSeedService.run(req.body.scope);
    return ApiResponse.success(res, result);
  });

  clearDemoData = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemSeedService.clearDemoData();
    return ApiResponse.success(res, result);
  });

  resetDevHint = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemSeedService.resetDevelopmentHint();
    return ApiResponse.success(res, result);
  });

  // Health
  unifiedHealth = asyncHandler(async (req: Request, res: Response) => {
    requireSuperAdmin(req);
    const result = await systemHealthService.getUnifiedHealth();
    return ApiResponse.success(res, result);
  });
}

export const systemAdminController = new SystemAdminController();

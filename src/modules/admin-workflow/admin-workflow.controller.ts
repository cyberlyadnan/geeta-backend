import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { systemDepartmentsService } from '../system-admin/system-departments.service.js';
import { systemWorkflowsService } from '../system-admin/system-workflows.service.js';
import { systemProductWorkflowsService } from '../system-admin/system-product-workflows.service.js';

/** Operations-facing workflow template management — reuses system-admin services, no engine changes. */
export class AdminWorkflowController {
  listDepartments = asyncHandler(async (req: Request, res: Response) => {
    const result = await systemDepartmentsService.list(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  listWorkflows = asyncHandler(async (req: Request, res: Response) => {
    const result = await systemWorkflowsService.list(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  getWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const result = await systemWorkflowsService.getById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  createWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const result = await systemWorkflowsService.create(req.body);
    return ApiResponse.created(res, result);
  });

  updateWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const result = await systemWorkflowsService.update(req.params['id'] as string, req.body);
    return ApiResponse.success(res, result);
  });

  duplicateWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const { newCode, newName } = req.body as { newCode: string; newName: string };
    const result = await systemWorkflowsService.duplicate(req.params['id'] as string, newCode, newName);
    return ApiResponse.created(res, result);
  });

  archiveWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const result = await systemWorkflowsService.archive(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  deleteWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const result = await systemWorkflowsService.delete(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  saveWorkflowSteps = asyncHandler(async (req: Request, res: Response) => {
    const result = await systemWorkflowsService.saveSteps(req.params['id'] as string, req.body);
    return ApiResponse.success(res, result);
  });

  listProductWorkflows = asyncHandler(async (req: Request, res: Response) => {
    const result = await systemProductWorkflowsService.list(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  linkProductWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const result = await systemProductWorkflowsService.link(req.body);
    return ApiResponse.success(res, result);
  });
}

export const adminWorkflowController = new AdminWorkflowController();

import type { Request, Response } from 'express';
import { ApiResponse } from '../../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { assignmentService } from './assignment.service.js';

export class AssignmentController {
  assign = asyncHandler(async (req: Request, res: Response) => {
    const result = await assignmentService.assign(
      req.body,
      req.user!.id,
      req.user!.role,
      req.user!.permissions,
    );
    return ApiResponse.created(res, result);
  });

  reassign = asyncHandler(async (req: Request, res: Response) => {
    const result = await assignmentService.reassign(
      req.params['assignmentId'] as string,
      req.body,
      req.user!.id,
      req.user!.role,
      req.user!.permissions,
    );
    return ApiResponse.success(res, result);
  });

  unassign = asyncHandler(async (req: Request, res: Response) => {
    const result = await assignmentService.unassign(
      req.params['assignmentId'] as string,
      req.body,
      req.user!.id,
      req.user!.role,
      req.user!.permissions,
    );
    return ApiResponse.success(res, result);
  });

  getCurrent = asyncHandler(async (req: Request, res: Response) => {
    const result = await assignmentService.getCurrentAssignment(req.params['taskId'] as string);
    return ApiResponse.success(res, result);
  });

  getHistory = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as { cursor?: string; limit: number };
    const result = await assignmentService.getAssignmentHistory(
      req.params['taskId'] as string,
      query.cursor,
      query.limit,
    );
    return ApiResponse.success(res, result);
  });

  searchOperators = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as import('./assignment.validation.js').OperatorSearchQuery;
    const result = await assignmentService.searchOperators(
      query,
      req.user!.role,
      req.user!.permissions,
    );
    return ApiResponse.success(res, result);
  });

  myTasks = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as import('./assignment.validation.js').MyTasksQuery;
    const operatorId = (req.validatedQuery as { operatorId?: string }).operatorId ?? req.user!.id;
    const result = await assignmentService.listMyTasks(
      operatorId,
      query,
      req.user!.id,
      req.user!.role,
      req.user!.permissions,
    );
    return ApiResponse.success(res, result);
  });
}

export const assignmentController = new AssignmentController();

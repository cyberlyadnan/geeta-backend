import type { Request, Response } from 'express';
import { ApiResponse } from '../../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { executionService } from './execution.service.js';
import type { DepartmentExecutionQuery } from './execution.validation.js';

function actorContext(req: Request) {
  return {
    actorId: req.user!.id,
    role: req.user!.role,
    permissions: req.user!.permissions,
  };
}

export class ExecutionController {
  start = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actorContext(req);
    const result = await executionService.startTask(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body,
    );
    return ApiResponse.success(res, result);
  });

  pause = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actorContext(req);
    const result = await executionService.pauseTask(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body,
    );
    return ApiResponse.success(res, result);
  });

  resume = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actorContext(req);
    const result = await executionService.resumeTask(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body,
    );
    return ApiResponse.success(res, result);
  });

  hold = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actorContext(req);
    const result = await executionService.holdTask(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body,
    );
    return ApiResponse.success(res, result);
  });

  releaseHold = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actorContext(req);
    const result = await executionService.releaseHold(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body,
    );
    return ApiResponse.success(res, result);
  });

  complete = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actorContext(req);
    const result = await executionService.completeTask(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body,
    );
    return ApiResponse.success(res, result);
  });

  getExecution = asyncHandler(async (req: Request, res: Response) => {
    const result = await executionService.getExecution(req.params['taskId'] as string);
    return ApiResponse.success(res, result);
  });

  addNote = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actorContext(req);
    const result = await executionService.addNote(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body,
    );
    return ApiResponse.created(res, result);
  });

  listNotes = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as { cursor?: string; limit: number };
    const result = await executionService.listNotes(
      req.params['taskId'] as string,
      query.cursor,
      query.limit,
    );
    return ApiResponse.success(res, result);
  });

  presignAttachment = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actorContext(req);
    const result = await executionService.presignAttachment(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body,
    );
    return ApiResponse.success(res, result);
  });

  registerAttachment = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actorContext(req);
    const result = await executionService.registerAttachment(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body,
    );
    return ApiResponse.created(res, result);
  });

  listAttachments = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as { cursor?: string; limit: number };
    const result = await executionService.listAttachments(
      req.params['taskId'] as string,
      query.cursor,
      query.limit,
    );
    return ApiResponse.success(res, result);
  });

  requestSupervisor = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actorContext(req);
    const result = await executionService.requestSupervisor(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body,
    );
    return ApiResponse.created(res, result);
  });

  reportIssue = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actorContext(req);
    const result = await executionService.reportIssue(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body,
    );
    return ApiResponse.created(res, result);
  });

  departmentExecution = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actorContext(req);
    const query = req.validatedQuery as DepartmentExecutionQuery;
    const result = await executionService.listDepartmentExecution(
      req.params['departmentId'] as string,
      query,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });
}

export const executionController = new ExecutionController();

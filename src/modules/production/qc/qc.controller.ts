import type { Request, Response } from 'express';
import { ApiResponse } from '../../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { qcService } from './qc.service.js';

function actor(req: Request) {
  return { actorId: req.user!.id, role: req.user!.role, permissions: req.user!.permissions };
}

export class QcController {
  start = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await qcService.startInspection(
      req.params['taskId'] as string,
      actorId,
      role,
      permissions,
      req.body.checklistTemplateId,
    );
    return ApiResponse.created(res, result);
  });

  getForTask = asyncHandler(async (req: Request, res: Response) => {
    const result = await qcService.getInspectionForTask(req.params['taskId'] as string);
    return ApiResponse.success(res, result);
  });

  updateChecklist = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await qcService.updateChecklist(
      req.params['inspectionId'] as string,
      req.body,
      actorId,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });

  addDefect = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await qcService.addDefect(
      req.params['inspectionId'] as string,
      req.body,
      actorId,
      role,
      permissions,
    );
    return ApiResponse.created(res, result);
  });

  addNote = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await qcService.addNote(
      req.params['inspectionId'] as string,
      req.body.text,
      actorId,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });

  presignAttachment = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await qcService.presignAttachment(
      req.params['inspectionId'] as string,
      req.body.fileName,
      req.body.contentType,
      req.body.fileSize,
      actorId,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });

  registerAttachment = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await qcService.registerAttachment(
      req.params['inspectionId'] as string,
      req.body,
      actorId,
      role,
      permissions,
    );
    return ApiResponse.created(res, result);
  });

  submit = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await qcService.submitResult(
      req.params['inspectionId'] as string,
      req.body,
      actorId,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });

  queue = asyncHandler(async (req: Request, res: Response) => {
    const result = await qcService.listQcQueue(req.params['departmentId'] as string);
    return ApiResponse.success(res, result);
  });

  metrics = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const query = req.validatedQuery as { departmentId?: string };
    const result = await qcService.getMetrics(query.departmentId, role, permissions);
    return ApiResponse.success(res, result);
  });
}

export const qcController = new QcController();

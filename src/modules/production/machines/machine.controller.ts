import type { Request, Response } from 'express';
import { ApiResponse } from '../../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { machineService } from './machine.service.js';

function actor(req: Request) {
  return { actorId: req.user!.id, role: req.user!.role, permissions: req.user!.permissions };
}

export class MachineController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const query = req.validatedQuery as import('./machine.validation.js').ListMachinesQuery;
    const result = await machineService.list(query, role, permissions);
    return ApiResponse.success(res, result);
  });

  overview = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await machineService.getOverview(role, permissions);
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await machineService.getById(req.params['machineId'] as string, role, permissions);
    return ApiResponse.success(res, result);
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await machineService.create(req.body, actorId, role, permissions);
    return ApiResponse.created(res, result);
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await machineService.update(
      req.params['machineId'] as string,
      req.body,
      actorId,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });

  archive = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await machineService.archive(
      req.params['machineId'] as string,
      actorId,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });

  restore = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await machineService.restore(
      req.params['machineId'] as string,
      actorId,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });

  changeStatus = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await machineService.changeStatus(
      req.params['machineId'] as string,
      req.body,
      actorId,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });

  addMaintenance = asyncHandler(async (req: Request, res: Response) => {
    const { actorId, role, permissions } = actor(req);
    const result = await machineService.addMaintenance(
      req.params['machineId'] as string,
      req.body,
      actorId,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });

  history = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await machineService.getHistory(
      req.params['machineId'] as string,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });
}

export const machineController = new MachineController();

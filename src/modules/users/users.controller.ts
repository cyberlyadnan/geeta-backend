import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { usersService } from './users.service.js';

export class UsersController {
  list = asyncHandler(async (_req: Request, res: Response) => {
    const result = await usersService.findAll();
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await usersService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });
}

export const usersController = new UsersController();

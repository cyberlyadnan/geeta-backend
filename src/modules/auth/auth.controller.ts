import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authService } from './auth.service.js';

export class AuthController {
  register = asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body);
    return ApiResponse.created(res, result, 'Registration successful');
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body);
    return ApiResponse.success(res, result, 'Login successful');
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const tokens = await authService.refresh(req.body.refreshToken);
    return ApiResponse.success(res, { tokens }, 'Token refreshed');
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    await authService.logout(req.body.refreshToken);
    return ApiResponse.success(res, null, 'Logged out successfully');
  });

  me = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, { user: req.user });
  });
}

export const authController = new AuthController();

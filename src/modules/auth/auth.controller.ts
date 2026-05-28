import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authService } from './auth.service.js';

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

export class AuthController {
  register = asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body);
    return ApiResponse.created(res, result, 'Registration successful');
  });

  registerVendor = asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.registerVendor(req.body, requestMeta(req));
    return ApiResponse.created(res, result, result.message);
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body, requestMeta(req));
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
    const user = await authService.getMe(req.user!.id);
    return ApiResponse.success(res, { user });
  });
}

export const authController = new AuthController();

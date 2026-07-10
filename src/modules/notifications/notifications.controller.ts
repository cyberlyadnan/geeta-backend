import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notificationsService } from './notifications.service.js';

export class NotificationsController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const limit = req.query['limit'] ? Number(req.query['limit']) : undefined;
    const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
    const unreadOnly = req.query['unreadOnly'] === 'true';

    const result = await notificationsService.findForUser(userId, { limit, cursor, unreadOnly });
    return ApiResponse.success(res, result);
  });

  unreadCount = asyncHandler(async (req: Request, res: Response) => {
    const count = await notificationsService.getUnreadCount(req.user!.id);
    return ApiResponse.success(res, { count });
  });

  markRead = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    await notificationsService.markRead(req.user!.id, id);
    return ApiResponse.success(res, { id, isRead: true });
  });

  markAllRead = asyncHandler(async (req: Request, res: Response) => {
    await notificationsService.markAllRead(req.user!.id);
    return ApiResponse.success(res, { success: true });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await notificationsService.findById(req.user!.id, req.params['id'] as string);
    return ApiResponse.success(res, result);
  });
}

export const notificationsController = new NotificationsController();

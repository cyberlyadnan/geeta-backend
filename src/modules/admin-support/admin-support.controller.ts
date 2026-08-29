import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminSupportService } from './admin-support.service.js';
import type {
  ApproveReprintInput,
  AssignInput,
  QueueQuery,
  RaiseOnBehalfInput,
  RejectInput,
  ResolveInput,
  StaffReplyInput,
  StatsQuery,
  SupportSettingsInput,
  UpdateTicketInput,
} from './admin-support.validation.js';

export class AdminSupportController {
  queue = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminSupportService.queue(req.validatedQuery as QueueQuery);
    return ApiResponse.success(res, result, 'Support queue', 200, result.meta);
  });

  getTicket = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await adminSupportService.getTicket(req.params['id'] as string));
  });

  reply = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminSupportService.reply(
      req.params['id'] as string,
      req.user!.id,
      req.body as StaffReplyInput,
    );
    return ApiResponse.success(res, result, 'Reply sent');
  });

  assign = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminSupportService.assign(
      req.params['id'] as string,
      req.user!.id,
      req.body as AssignInput,
    );
    return ApiResponse.success(res, result, 'Ticket assigned');
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminSupportService.update(
      req.params['id'] as string,
      req.user!.id,
      req.body as UpdateTicketInput,
    );
    return ApiResponse.success(res, result, 'Ticket updated');
  });

  approveReprint = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminSupportService.approveReprint(
      req.params['id'] as string,
      req.user!.id,
      req.body as ApproveReprintInput,
    );
    return ApiResponse.success(res, result, 'Reprint approved');
  });

  reject = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminSupportService.reject(
      req.params['id'] as string,
      req.user!.id,
      req.body as RejectInput,
    );
    return ApiResponse.success(res, result, 'Request declined');
  });

  resolve = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminSupportService.resolve(
      req.params['id'] as string,
      req.user!.id,
      req.body as ResolveInput,
    );
    return ApiResponse.success(res, result, 'Ticket resolved');
  });

  close = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(
      res,
      await adminSupportService.close(req.params['id'] as string, req.user!.id),
      'Ticket closed',
    );
  });

  reopen = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(
      res,
      await adminSupportService.reopen(req.params['id'] as string, req.user!.id),
      'Ticket reopened',
    );
  });

  raiseOnBehalf = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminSupportService.raiseOnBehalf(req.user!.id, req.body as RaiseOnBehalfInput);
    return ApiResponse.created(res, result, 'Ticket created');
  });

  agents = asyncHandler(async (_req: Request, res: Response) => {
    return ApiResponse.success(res, await adminSupportService.agents());
  });

  getSettings = asyncHandler(async (_req: Request, res: Response) => {
    return ApiResponse.success(res, await adminSupportService.getSettings());
  });

  updateSettings = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminSupportService.updateSettings(
      req.body as SupportSettingsInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Support settings updated');
  });

  stats = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await adminSupportService.stats(req.validatedQuery as StatsQuery));
  });
}

export const adminSupportController = new AdminSupportController();

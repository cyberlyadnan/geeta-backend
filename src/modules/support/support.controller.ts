import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { supportService } from './support.service.js';
import type {
  ListMyTicketsQuery,
  RaiseComplaintInput,
  RaiseReprintInput,
  RateTicketInput,
  ReplyInput,
  ReprintEligibilityQuery,
  UploadTicketInput,
} from './support.validation.js';

export class SupportController {
  settings = asyncHandler(async (_req: Request, res: Response) => {
    return ApiResponse.success(res, await supportService.getPublicSettings());
  });

  reprintEligibility = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ReprintEligibilityQuery;
    const result = await supportService.checkReprintEligibility(req.user!.id, query);
    return ApiResponse.success(res, result);
  });

  reprintableOrders = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await supportService.reprintableOrders(req.user!.id));
  });

  raiseReprint = asyncHandler(async (req: Request, res: Response) => {
    const result = await supportService.raiseReprint(req.user!.id, req.body as RaiseReprintInput);
    return ApiResponse.created(res, result, 'Reprint request submitted');
  });

  raiseComplaint = asyncHandler(async (req: Request, res: Response) => {
    const result = await supportService.raiseComplaint(req.user!.id, req.body as RaiseComplaintInput);
    return ApiResponse.created(res, result, 'Complaint registered');
  });

  listMine = asyncHandler(async (req: Request, res: Response) => {
    const result = await supportService.listMine(req.user!.id, req.validatedQuery as ListMyTicketsQuery);
    return ApiResponse.success(res, result, 'Your requests', 200, result.meta);
  });

  getTicket = asyncHandler(async (req: Request, res: Response) => {
    const result = await supportService.getTicket(req.user!.id, req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  reply = asyncHandler(async (req: Request, res: Response) => {
    const result = await supportService.reply(
      req.user!.id,
      req.params['id'] as string,
      req.body as ReplyInput,
    );
    return ApiResponse.success(res, result, 'Reply sent');
  });

  requestUpload = asyncHandler(async (req: Request, res: Response) => {
    const result = await supportService.requestUpload(req.user!.id, req.body as UploadTicketInput);
    return ApiResponse.success(res, result);
  });

  rate = asyncHandler(async (req: Request, res: Response) => {
    const result = await supportService.rate(
      req.user!.id,
      req.params['id'] as string,
      req.body as RateTicketInput,
    );
    return ApiResponse.success(res, result, 'Thank you for the feedback');
  });
}

export const supportController = new SupportController();

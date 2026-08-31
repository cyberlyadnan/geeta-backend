import type { Request, Response } from 'express';
import { z } from 'zod';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { deliveryPortalService } from './delivery-portal.service.js';
import type {
  DeliverInput,
  FailInput,
  ListQueueQuery,
  PickupInput,
  UploadUrlInput,
} from './delivery-portal.validation.js';

const returnedSchema = z.object({ reason: z.string().trim().min(3).max(600) });

export class DeliveryPortalController {
  me = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await deliveryPortalService.me(req.user!.id));
  });

  queue = asyncHandler(async (req: Request, res: Response) => {
    const result = await deliveryPortalService.queue(
      req.user!.id,
      req.validatedQuery as ListQueueQuery,
    );
    return ApiResponse.success(res, result, 'Consignments', 200, result.meta);
  });

  get = asyncHandler(async (req: Request, res: Response) => {
    const result = await deliveryPortalService.get(req.user!.id, req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  accept = asyncHandler(async (req: Request, res: Response) => {
    const result = await deliveryPortalService.accept(req.user!.id, req.params['id'] as string);
    return ApiResponse.success(res, result, 'Consignment is yours');
  });

  release = asyncHandler(async (req: Request, res: Response) => {
    const result = await deliveryPortalService.release(req.user!.id, req.params['id'] as string);
    return ApiResponse.success(res, result, 'Handed back to the queue');
  });

  pickup = asyncHandler(async (req: Request, res: Response) => {
    const result = await deliveryPortalService.pickup(
      req.user!.id,
      req.params['id'] as string,
      req.body as PickupInput,
    );
    return ApiResponse.success(res, result, 'Marked collected');
  });

  inTransit = asyncHandler(async (req: Request, res: Response) => {
    const result = await deliveryPortalService.markInTransit(
      req.user!.id,
      req.params['id'] as string,
    );
    return ApiResponse.success(res, result, 'On the road');
  });

  deliver = asyncHandler(async (req: Request, res: Response) => {
    const result = await deliveryPortalService.deliver(
      req.user!.id,
      req.params['id'] as string,
      req.body as DeliverInput,
    );
    return ApiResponse.success(res, result, 'Delivered');
  });

  fail = asyncHandler(async (req: Request, res: Response) => {
    const result = await deliveryPortalService.fail(
      req.user!.id,
      req.params['id'] as string,
      req.body as FailInput,
    );
    return ApiResponse.success(res, result, 'Attempt recorded');
  });

  retry = asyncHandler(async (req: Request, res: Response) => {
    const result = await deliveryPortalService.retry(req.user!.id, req.params['id'] as string);
    return ApiResponse.success(res, result, 'Trying again');
  });

  markReturned = asyncHandler(async (req: Request, res: Response) => {
    const body = returnedSchema.parse(req.body);
    const result = await deliveryPortalService.markReturned(
      req.user!.id,
      req.params['id'] as string,
      body.reason,
    );
    return ApiResponse.success(res, result, 'Marked returned');
  });

  uploadUrl = asyncHandler(async (req: Request, res: Response) => {
    const result = await deliveryPortalService.createUploadTicket(req.body as UploadUrlInput);
    return ApiResponse.success(res, result);
  });
}

export const deliveryPortalController = new DeliveryPortalController();

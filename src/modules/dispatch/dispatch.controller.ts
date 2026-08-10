import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { dispatchService } from './dispatch.service.js';
import type {
  CreateShiftInput,
  ListBatchesQuery,
  ListShiftsQuery,
  SetDeliveryChargeInput,
  UpdateShiftInput,
} from './dispatch.validation.js';

export class DispatchController {
  listShifts = asyncHandler(async (req: Request, res: Response) => {
    const { includeInactive } = req.validatedQuery as ListShiftsQuery;
    const result = await dispatchService.listShifts(includeInactive);
    return ApiResponse.success(res, { items: result });
  });

  createShift = asyncHandler(async (req: Request, res: Response) => {
    const result = await dispatchService.createShift(req.body as CreateShiftInput);
    return ApiResponse.created(res, result, 'Delivery shift created');
  });

  updateShift = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await dispatchService.updateShift(id, req.body as UpdateShiftInput);
    return ApiResponse.success(res, result, 'Delivery shift updated');
  });

  listBatches = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ListBatchesQuery;
    const result = await dispatchService.listBatches(query);
    return ApiResponse.success(res, result);
  });

  getBatch = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await dispatchService.getBatch(id);
    return ApiResponse.success(res, result);
  });

  setDeliveryCharge = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const { amount } = req.body as SetDeliveryChargeInput;
    const result = await dispatchService.setDeliveryCharge(id, amount, req.user!.id);
    // A hold is a legitimate, expected outcome rather than a failure — 200 with an explicit
    // status so the dispatcher UI can show the shortfall instead of an error toast.
    return ApiResponse.success(
      res,
      result,
      result.status === 'READY' ? 'Batch billed and invoice generated' : 'Batch held — insufficient balance',
    );
  });

  markDispatched = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await dispatchService.markDispatched(id);
    return ApiResponse.success(res, result, 'Batch marked dispatched');
  });

  removeOrder = asyncHandler(async (req: Request, res: Response) => {
    const { id, orderId } = req.validatedParams as { id: string; orderId: string };
    const result = await dispatchService.removeOrderFromBatch(id, orderId, req.user!.id);
    return ApiResponse.success(res, result, 'Order deferred to next shift');
  });

  getInvoice = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await dispatchService.getInvoiceForBatch(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.send(result.buffer);
  });
}

export const dispatchController = new DispatchController();

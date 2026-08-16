import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { orderPaymentService } from './order-payment.service.js';
import type { RecordOrderPaymentBody } from './order-payment.validation.js';

export class OrderPaymentController {
  recordPayment = asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.validatedParams as { orderId: string };
    const body = req.body as RecordOrderPaymentBody;
    const result = await orderPaymentService.recordPayment(orderId, req.user!.id, body);
    return ApiResponse.created(res, result, 'Payment recorded');
  });

  getSummary = asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.validatedParams as { orderId: string };
    const result = await orderPaymentService.getPaymentSummary(orderId);
    return ApiResponse.success(res, result);
  });
}

export const orderPaymentController = new OrderPaymentController();

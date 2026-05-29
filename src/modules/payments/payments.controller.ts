import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { paymentsService } from './payments.service.js';
import type { CreatePaymentInput } from './payments.validation.js';

export class PaymentsController {
  create = asyncHandler(async (req: Request, res: Response) => {
    const result = await paymentsService.createRechargePayment(
      req.user!.id,
      req.body as CreatePaymentInput,
    );
    return ApiResponse.created(res, result, 'Payment initiated');
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await paymentsService.getPaymentForUser(req.user!.id, id);
    return ApiResponse.success(res, result);
  });

  webhook = asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody = req.body as Buffer;
    const result = await paymentsService.processWebhook(rawBody, signature);
    return ApiResponse.success(res, result);
  });
}

export const paymentsController = new PaymentsController();

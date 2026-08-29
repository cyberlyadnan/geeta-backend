import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { purchasesService } from './purchases.service.js';
import type {
  BillListQuery,
  CreatePurchaseBillInput,
  CreateSupplierInput,
  CreateSupplierPaymentInput,
  PaymentListQuery,
  SupplierListQuery,
  UpdateSupplierInput,
} from './purchases.validation.js';

export class PurchasesController {
  listSuppliers = asyncHandler(async (req: Request, res: Response) => {
    const result = await purchasesService.listSuppliers(req.validatedQuery as SupplierListQuery);
    return ApiResponse.success(res, result, 'Suppliers', 200, result.meta);
  });

  getSupplier = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await purchasesService.getSupplier(req.params['id'] as string));
  });

  createSupplier = asyncHandler(async (req: Request, res: Response) => {
    const result = await purchasesService.createSupplier(req.body as CreateSupplierInput, req.user!.id);
    return ApiResponse.created(res, result, 'Supplier added');
  });

  updateSupplier = asyncHandler(async (req: Request, res: Response) => {
    const result = await purchasesService.updateSupplier(
      req.params['id'] as string,
      req.body as UpdateSupplierInput,
    );
    return ApiResponse.success(res, result, 'Supplier updated');
  });

  listBills = asyncHandler(async (req: Request, res: Response) => {
    const result = await purchasesService.listBills(req.validatedQuery as BillListQuery);
    return ApiResponse.success(res, result, 'Purchase bills', 200, result.meta);
  });

  getBill = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await purchasesService.getBill(req.params['id'] as string));
  });

  createBill = asyncHandler(async (req: Request, res: Response) => {
    const result = await purchasesService.createBill(req.body as CreatePurchaseBillInput, req.user!.id);
    return ApiResponse.created(res, result, 'Purchase bill recorded');
  });

  cancelBill = asyncHandler(async (req: Request, res: Response) => {
    const { reason } = req.body as { reason: string };
    const result = await purchasesService.cancelBill(req.params['id'] as string, reason, req.user!.id);
    return ApiResponse.success(res, result, 'Purchase bill cancelled');
  });

  listPayments = asyncHandler(async (req: Request, res: Response) => {
    const result = await purchasesService.listPayments(req.validatedQuery as PaymentListQuery);
    return ApiResponse.success(res, result, 'Supplier payments', 200, result.meta);
  });

  createPayment = asyncHandler(async (req: Request, res: Response) => {
    const result = await purchasesService.createPayment(
      req.body as CreateSupplierPaymentInput,
      req.user!.id,
    );
    return ApiResponse.created(res, result, 'Payment recorded');
  });
}

export const purchasesController = new PurchasesController();

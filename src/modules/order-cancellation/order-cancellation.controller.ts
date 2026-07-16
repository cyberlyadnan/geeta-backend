import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { orderCancellationService } from './order-cancellation.service.js';

export const orderCancellationController = {
  listReasons: asyncHandler(async (_req: Request, res: Response) => {
    const reasons = await orderCancellationService.listActiveReasons();
    return ApiResponse.success(res, reasons);
  }),

  getPolicy: asyncHandler(async (req: Request, res: Response) => {
    const policy = await orderCancellationService.getPolicyForOrder(
      req.params['orderId'] as string,
      req.user!.id,
      req.user!.role,
    );
    return ApiResponse.success(res, policy);
  }),

  vendorCancel: asyncHandler(async (req: Request, res: Response) => {
    const result = await orderCancellationService.vendorDirectCancel(
      req.params['orderId'] as string,
      req.user!.id,
      req.body,
    );
    return ApiResponse.success(res, result);
  }),

  vendorRequestCancellation: asyncHandler(async (req: Request, res: Response) => {
    const result = await orderCancellationService.vendorRequestCancellation(
      req.params['orderId'] as string,
      req.user!.id,
      req.body,
    );
    return ApiResponse.created(res, result);
  }),

  listRequests: asyncHandler(async (req: Request, res: Response) => {
    const result = await orderCancellationService.listRequests(
      req.validatedQuery as import('./order-cancellation.validation.js').ListCancellationRequestsQuery,
      req.user!.role,
      req.user!.permissions ?? [],
    );
    return ApiResponse.success(res, result);
  }),

  getRequest: asyncHandler(async (req: Request, res: Response) => {
    const result = await orderCancellationService.getRequestById(
      req.params['requestId'] as string,
      req.user!.id,
      req.user!.role,
      req.user!.permissions ?? [],
    );
    return ApiResponse.success(res, result);
  }),

  approveRequest: asyncHandler(async (req: Request, res: Response) => {
    const result = await orderCancellationService.approveRequest(
      req.params['requestId'] as string,
      req.user!.id,
      req.user!.role,
      req.user!.permissions ?? [],
      req.body,
    );
    return ApiResponse.success(res, result);
  }),

  rejectRequest: asyncHandler(async (req: Request, res: Response) => {
    const result = await orderCancellationService.rejectRequest(
      req.params['requestId'] as string,
      req.user!.id,
      req.user!.role,
      req.user!.permissions ?? [],
      req.body,
    );
    return ApiResponse.success(res, result);
  }),

  pendingCount: asyncHandler(async (req: Request, res: Response) => {
    const result = await orderCancellationService.getPendingCount(
      req.user!.role,
      req.user!.permissions ?? [],
    );
    return ApiResponse.success(res, result);
  }),

  adminOverrideCancel: asyncHandler(async (req: Request, res: Response) => {
    const result = await orderCancellationService.adminOverrideCancel(
      req.params['orderId'] as string,
      req.user!.id,
      req.user!.role,
      req.body,
    );
    return ApiResponse.success(res, result);
  }),

  adminListReasons: asyncHandler(async (_req: Request, res: Response) => {
    const reasons = await orderCancellationService.adminListReasons();
    return ApiResponse.success(res, reasons);
  }),

  adminCreateReason: asyncHandler(async (req: Request, res: Response) => {
    const reason = await orderCancellationService.adminCreateReason(req.body);
    return ApiResponse.created(res, reason);
  }),

  adminUpdateReason: asyncHandler(async (req: Request, res: Response) => {
    const reason = await orderCancellationService.adminUpdateReason(
      req.params['id'] as string,
      req.body,
    );
    return ApiResponse.success(res, reason);
  }),

  adminListPolicies: asyncHandler(async (_req: Request, res: Response) => {
    const policies = await orderCancellationService.adminListPolicies();
    return ApiResponse.success(res, policies);
  }),

  adminUpsertPolicy: asyncHandler(async (req: Request, res: Response) => {
    const policy = await orderCancellationService.adminUpsertPolicy(req.body);
    return ApiResponse.success(res, policy);
  }),
};

import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ordersService } from './orders.service.js';
import { orderDraftsService } from './order-drafts.service.js';
import { orderAmendmentService } from './order-amendment.service.js';
import type {
  CreateProductionOrderInput,
  ListOrdersQuery,
  OrderPreviewInput,
  SaveDraftInput,
} from './orders.validation.js';
import type { RequestAmendmentInput } from './order-amendment.validation.js';

export class OrdersController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ListOrdersQuery;
    const result = await ordersService.findAll(req.user!.id, query);
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await ordersService.findById(req.user!.id, id);
    return ApiResponse.success(res, result);
  });

  preview = asyncHandler(async (req: Request, res: Response) => {
    const result = await ordersService.preview(
      { type: 'vendor', vendorUserId: req.user!.id },
      req.body as OrderPreviewInput,
    );
    return ApiResponse.success(res, result);
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const result = await ordersService.create(
      { type: 'vendor', vendorUserId: req.user!.id },
      req.body as CreateProductionOrderInput,
    );
    return ApiResponse.created(res, result, 'Order placed successfully');
  });

  reorder = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const payload = await ordersService.buildReorderPayload(req.user!.id, id);
    return ApiResponse.success(res, payload);
  });

  listDrafts = asyncHandler(async (req: Request, res: Response) => {
    const drafts = await orderDraftsService.list(req.user!.id);
    return ApiResponse.success(res, drafts);
  });

  saveDraft = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as SaveDraftInput;
    const draft = await orderDraftsService.upsert(req.user!.id, body);
    return ApiResponse.success(res, draft, 'Draft saved');
  });

  deleteDraft = asyncHandler(async (req: Request, res: Response) => {
    const { draftId } = req.validatedParams as { draftId: string };
    const result = await orderDraftsService.remove(req.user!.id, draftId);
    return ApiResponse.success(res, result);
  });

  requestAmendment = asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.validatedParams as { orderId: string };
    const result = await orderAmendmentService.requestAmendment(
      orderId,
      req.user!.id,
      req.body as RequestAmendmentInput,
    );
    return ApiResponse.created(res, result, 'Order amended');
  });

  amendmentContext = asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.validatedParams as { orderId: string };
    const result = await orderAmendmentService.getAmendmentContext(orderId);
    return ApiResponse.success(res, result);
  });

  myAmendments = asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.validatedParams as { orderId: string };
    const result = await orderAmendmentService.listAmendmentsForCustomer(req.user!.id, orderId);
    return ApiResponse.success(res, result);
  });

  previewAmendment = asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.validatedParams as { orderId: string };
    const result = await orderAmendmentService.previewAmendment(
      orderId,
      req.body as RequestAmendmentInput,
    );
    return ApiResponse.success(res, result);
  });

  listAmendments = asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.validatedParams as { orderId: string };
    const result = await orderAmendmentService.listAmendments(orderId);
    return ApiResponse.success(res, result);
  });

  downloadInvoice = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await ordersService.getInvoiceForOrder(req.user!.id, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.send(result.buffer);
  });
}

export const ordersController = new OrdersController();

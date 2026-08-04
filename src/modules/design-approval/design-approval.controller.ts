import type { Request, Response } from 'express';
import type { DesignTaskStatus } from '@prisma/client';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { designApprovalService } from './design-approval.service.js';
import type {
  ListDesignQueueQuery,
  SubmitProofInput,
  VendorDecisionInput,
} from './design-approval.validation.js';

export class DesignApprovalController {
  /** Design team submits a proof for the customer to review. */
  submitProof = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const body = req.body as SubmitProofInput;
    const result = await designApprovalService.submitProof({
      designTaskId: id,
      proofUrl: body.proofUrl,
      notes: body.notes,
      submittedByUserId: req.user!.id,
    });
    return ApiResponse.created(res, result, 'Proof sent to the customer');
  });

  /** Vendor approves or requests changes at whichever gate is open. */
  recordDecision = asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.validatedParams as { orderId: string };
    const body = req.body as VendorDecisionInput;
    const result = await designApprovalService.recordVendorDecision({
      orderId,
      approved: body.approved,
      revisionNote: body.revisionNote,
      vendorUserId: req.user!.id,
    });
    return ApiResponse.success(
      res,
      result,
      result.approved ? 'Approved — thank you!' : 'Your change request has been sent to the design team',
    );
  });

  /** Everything the vendor-facing approval screen needs for one order. */
  getForOrder = asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.validatedParams as { orderId: string };
    const result = await designApprovalService.getForOrder(orderId, req.user!.id);
    return ApiResponse.success(res, result);
  });

  /** The design department's work list. */
  listQueue = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ListDesignQueueQuery;
    const result = await designApprovalService.listDesignQueue({
      status: query.status as DesignTaskStatus | undefined,
      page: query.page,
      limit: query.limit,
    });
    return ApiResponse.success(res, result);
  });
}

export const designApprovalController = new DesignApprovalController();

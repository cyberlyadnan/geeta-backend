import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { creditNotesService } from './credit-notes.service.js';
import type { CreateCreditNoteInput, CreditNoteListQuery } from './credit-notes.validation.js';

export class CreditNotesController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await creditNotesService.list(req.validatedQuery as CreditNoteListQuery);
    return ApiResponse.success(res, result, 'Credit notes', 200, result.meta);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await creditNotesService.findById(req.params['id'] as string));
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const result = await creditNotesService.create(req.body as CreateCreditNoteInput, req.user!.id);
    return ApiResponse.created(res, result, 'Credit note issued');
  });

  cancel = asyncHandler(async (req: Request, res: Response) => {
    const { reason } = req.body as { reason: string };
    const result = await creditNotesService.cancel(req.params['id'] as string, reason, req.user!.id);
    return ApiResponse.success(res, result, 'Credit note cancelled');
  });
}

export const creditNotesController = new CreditNotesController();

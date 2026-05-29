import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { contactService } from './contact.service.js';
import type { ListContactInquiriesInput } from './contact.validation.js';

function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim();
  }
  return req.ip;
}

export class ContactController {
  create = asyncHandler(async (req: Request, res: Response) => {
    const result = await contactService.create(req.body, {
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });
    return ApiResponse.created(res, result, 'Your message has been received');
  });

  stats = asyncHandler(async (_req: Request, res: Response) => {
    const result = await contactService.getStats();
    return ApiResponse.success(res, result);
  });

  listAssignees = asyncHandler(async (_req: Request, res: Response) => {
    const result = await contactService.listAssignees();
    return ApiResponse.success(res, result);
  });

  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await contactService.findAll(
      req.validatedQuery as ListContactInquiriesInput,
    );
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await contactService.findById(
      req.params['id'] as string,
      req.user?.id,
    );
    return ApiResponse.success(res, result);
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const result = await contactService.update(
      req.params['id'] as string,
      req.body,
      req.user?.id,
    );
    return ApiResponse.success(res, result, 'Inquiry updated');
  });

  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const result = await contactService.updateStatus(
      req.params['id'] as string,
      req.body,
      req.user?.id,
    );
    return ApiResponse.success(res, result, 'Status updated');
  });

  addNote = asyncHandler(async (req: Request, res: Response) => {
    const result = await contactService.addNote(
      req.params['id'] as string,
      req.body,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Note added');
  });
}

export const contactController = new ContactController();

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

  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await contactService.findAll(
      req.validatedQuery as ListContactInquiriesInput,
    );
    return ApiResponse.paginated(res, result.items, result.meta);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await contactService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const result = await contactService.updateStatus(
      req.params['id'] as string,
      req.body,
    );
    return ApiResponse.success(res, result, 'Status updated');
  });
}

export const contactController = new ContactController();

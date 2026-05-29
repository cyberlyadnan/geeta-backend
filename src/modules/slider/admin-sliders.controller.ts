import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sliderService } from './slider.service.js';
import type {
  BulkSlideStatusInput,
  CreateSlideInput,
  ListAdminSlidesQuery,
  ReorderSlidesInput,
  UpdateSlideInput,
} from './slider.validation.js';
import { SlideStatus } from '@prisma/client';

export class AdminSlidersController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ListAdminSlidesQuery;
    const result = await sliderService.listAdmin(query);
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const slide = await sliderService.getById(id);
    return ApiResponse.success(res, slide);
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const slide = await sliderService.create(req.body as CreateSlideInput, req.user!.id);
    return ApiResponse.created(res, slide, 'Slide created');
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const slide = await sliderService.update(id, req.body as UpdateSlideInput, req.user!.id);
    return ApiResponse.success(res, slide, 'Slide updated');
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    await sliderService.delete(id);
    return ApiResponse.success(res, null, 'Slide deleted');
  });

  duplicate = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const slide = await sliderService.duplicate(id, req.user!.id);
    return ApiResponse.created(res, slide, 'Slide duplicated');
  });

  reorder = asyncHandler(async (req: Request, res: Response) => {
    const result = await sliderService.reorder(req.body as ReorderSlidesInput, req.user!.id);
    return ApiResponse.success(res, result, 'Slides reordered');
  });

  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const { status } = req.body as { status: SlideStatus };
    const slide = await sliderService.updateStatus(id, status, req.user!.id);
    return ApiResponse.success(res, slide, 'Slide status updated');
  });

  bulkStatus = asyncHandler(async (req: Request, res: Response) => {
    const result = await sliderService.bulkUpdateStatus(
      req.body as BulkSlideStatusInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Slides updated');
  });
}

export const adminSlidersController = new AdminSlidersController();

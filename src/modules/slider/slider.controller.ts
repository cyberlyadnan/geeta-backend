import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { GLOBAL_SLIDER_KEY } from './slider.constants.js';
import { sliderService } from './slider.service.js';

export class SliderController {
  listPublic = asyncHandler(async (req: Request, res: Response) => {
    const rawKey = req.query['sliderKey'];
    const sliderKey =
      typeof rawKey === 'string' && rawKey.length > 0 ? rawKey : GLOBAL_SLIDER_KEY;
    const slides = await sliderService.listPublic(sliderKey);
    return ApiResponse.success(res, { slides });
  });
}

export const sliderController = new SliderController();

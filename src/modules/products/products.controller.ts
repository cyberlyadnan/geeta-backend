import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { productsService } from './products.service.js';
import type { CalculatePriceInput } from '../admin-products/admin-products.validation.js';

export class ProductsController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const { search, categoryId, familyId, seriesId, page, limit } = req.query;
    const result = await productsService.findAll({
      search: search as string | undefined,
      categoryId: categoryId as string | undefined,
      familyId: familyId as string | undefined,
      seriesId: seriesId as string | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return ApiResponse.success(res, result);
  });

  listFamilies = asyncHandler(async (req: Request, res: Response) => {
    const categoryId = req.query['categoryId'] as string | undefined;
    if (!categoryId) throw ApiError.badRequest('categoryId is required');
    const result = await productsService.listFamilies(categoryId);
    return ApiResponse.success(res, result);
  });

  listSeries = asyncHandler(async (req: Request, res: Response) => {
    const familyId = req.query['familyId'] as string | undefined;
    if (!familyId) throw ApiError.badRequest('familyId is required');
    const result = await productsService.listSeries(familyId);
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await productsService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  calculatePrice = asyncHandler(async (req: Request, res: Response) => {
    const result = await productsService.calculatePrice(req.body as CalculatePriceInput, req.user!.id);
    return ApiResponse.success(res, result);
  });

  matrixAvailability = asyncHandler(async (req: Request, res: Response) => {
    const versionId = req.query['versionId'] as string | undefined;
    const quantity = Number(req.query['quantity']);
    if (!versionId) throw ApiError.badRequest('versionId is required');
    if (!Number.isFinite(quantity) || quantity <= 0) throw ApiError.badRequest('quantity must be a positive number');
    const result = await productsService.getMatrixAvailability(versionId, quantity);
    return ApiResponse.success(res, result);
  });
}

export const productsController = new ProductsController();

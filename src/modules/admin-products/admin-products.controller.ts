import type { Request, Response } from 'express';
import { ProductStatus } from '@prisma/client';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminProductsService } from './admin-products.service.js';
import { adminAttributesService } from './admin-attributes.service.js';
import { adminConfigRulesService } from './admin-config-rules.service.js';
import { adminPricingRulesService } from './admin-pricing-rules.service.js';
import {
  adminCategoriesService,
  adminProductImagesService,
} from './admin-categories.service.js';
import { adminCatalogService } from './admin-catalog.service.js';
import type {
  CalculatePriceInput,
  CreateAttributeInput,
  CreateConfigRuleInput,
  CreatePricingRuleInput,
  CreateProductInput,
  ListAttributesQuery,
  ListConfigRulesQuery,
  ListPricingRulesQuery,
  ListProductsQuery,
  OrderConfigurationQuery,
  UpdateAttributeInput,
  UpdateConfigRuleInput,
  UpdatePricingRuleInput,
  UpdateProductInput,
  UpsertQuantityTierInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  ListFamiliesQuery,
  CreateFamilyInput,
  UpdateFamilyInput,
  ListSeriesQuery,
  CreateSeriesInput,
  UpdateSeriesInput,
  ReorderCatalogInput,
  UpdateDesignServiceInput,
} from './admin-products.validation.js';
import type { AddProductImageInput } from './admin-categories.service.js';

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

export class AdminProductsController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminProductsService.list(req.validatedQuery as ListProductsQuery);
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminProductsService.getById(id);
    return ApiResponse.success(res, result);
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminProductsService.create(
      req.body as CreateProductInput,
      req.user!.id,
      requestMeta(req),
    );
    return ApiResponse.created(res, result, 'Product created');
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminProductsService.update(
      id,
      req.body as UpdateProductInput,
      req.user!.id,
      requestMeta(req),
    );
    return ApiResponse.success(res, result, 'Product updated');
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminProductsService.delete(id, req.user!.id);
    return ApiResponse.success(res, result, 'Product deleted');
  });

  clone = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminProductsService.clone(id, req.user!.id);
    return ApiResponse.created(res, result, 'Product cloned');
  });

  publish = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminProductsService.publish(id, req.user!.id);
    return ApiResponse.success(res, result, 'Product published');
  });

  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const { status } = req.body as { status: ProductStatus };
    const result = await adminProductsService.update(
      id,
      { status },
      req.user!.id,
      requestMeta(req),
    );
    return ApiResponse.success(res, result, 'Product status updated');
  });

  previewPrice = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminProductsService.previewPrice(req.body as CalculatePriceInput);
    return ApiResponse.success(res, result);
  });

  updateDesignService = asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedParams as { versionId: string };
    const result = await adminProductsService.updateDesignService(
      versionId,
      req.body as UpdateDesignServiceInput,
    );
    return ApiResponse.success(res, result, 'Design service settings updated');
  });

  addImage = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminProductImagesService.add(id, req.body as AddProductImageInput);
    return ApiResponse.created(res, result, 'Image added');
  });

  removeImage = asyncHandler(async (req: Request, res: Response) => {
    const { id, imageId } = req.validatedParams as { id: string; imageId: string };
    const result = await adminProductImagesService.remove(id, imageId);
    return ApiResponse.success(res, result, 'Image removed');
  });

  // Attributes
  listAttributes = asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedQuery as ListAttributesQuery;
    const result = await adminAttributesService.list(versionId);
    return ApiResponse.success(res, result);
  });

  createAttribute = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminAttributesService.create(req.body as CreateAttributeInput, req.user!.id);
    return ApiResponse.created(res, result, 'Attribute created');
  });

  updateAttribute = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminAttributesService.update(id, req.body as UpdateAttributeInput, req.user!.id);
    return ApiResponse.success(res, result, 'Attribute updated');
  });

  deleteAttribute = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminAttributesService.delete(id, req.user!.id);
    return ApiResponse.success(res, result, 'Attribute deleted');
  });

  // Order configuration (ConfigurationRule + aggregated Product Version order config)
  listConfigRules = asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedQuery as ListConfigRulesQuery;
    const result = await adminConfigRulesService.list(versionId);
    return ApiResponse.success(res, result);
  });

  createConfigRule = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminConfigRulesService.create(req.body as CreateConfigRuleInput);
    return ApiResponse.created(res, result, 'Configuration rule created');
  });

  updateConfigRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminConfigRulesService.update(id, req.body as UpdateConfigRuleInput);
    return ApiResponse.success(res, result, 'Configuration rule updated');
  });

  deleteConfigRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminConfigRulesService.delete(id);
    return ApiResponse.success(res, result, 'Configuration rule deleted');
  });

  getOrderConfiguration = asyncHandler(async (req: Request, res: Response) => {
    const { versionId, selections } = req.validatedQuery as OrderConfigurationQuery;
    let parsed: Record<string, string> = {};
    if (selections) {
      try {
        parsed = JSON.parse(selections) as Record<string, string>;
      } catch {
        parsed = {};
      }
    }
    const result = await adminConfigRulesService.getOrderConfiguration(versionId, parsed);
    return ApiResponse.success(res, result);
  });

  // Pricing
  listPricingRules = asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedQuery as ListPricingRulesQuery;
    const result = await adminPricingRulesService.list(versionId);
    return ApiResponse.success(res, result);
  });

  createPricingRule = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPricingRulesService.createRule(req.body as CreatePricingRuleInput, req.user!.id);
    return ApiResponse.created(res, result, 'Pricing rule created');
  });

  updatePricingRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminPricingRulesService.updateRule(id, req.body as UpdatePricingRuleInput, req.user!.id);
    return ApiResponse.success(res, result, 'Pricing rule updated');
  });

  deletePricingRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminPricingRulesService.deleteRule(id, req.user!.id);
    return ApiResponse.success(res, result, 'Pricing rule deleted');
  });

  upsertQuantityTier = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPricingRulesService.upsertQuantityTier(
      req.body as UpsertQuantityTierInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Quantity tier saved');
  });

  deleteQuantityTier = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminPricingRulesService.deleteQuantityTier(id, req.user!.id);
    return ApiResponse.success(res, result, 'Quantity tier deleted');
  });

  // Categories
  listCategories = asyncHandler(async (_req: Request, res: Response) => {
    const result = await adminCategoriesService.listTree();
    return ApiResponse.success(res, result);
  });

  createCategory = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminCategoriesService.create(req.body as CreateCategoryInput);
    return ApiResponse.created(res, result, 'Category created');
  });

  updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCategoriesService.update(id, req.body as UpdateCategoryInput);
    return ApiResponse.success(res, result, 'Category updated');
  });

  deleteCategory = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCategoriesService.delete(id);
    return ApiResponse.success(res, result, 'Category deleted');
  });

  getCategoryCatalog = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCategoriesService.getCatalogTree(id);
    return ApiResponse.success(res, result);
  });

  // Families
  listFamilies = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminCatalogService.listFamilies(req.validatedQuery as ListFamiliesQuery);
    return ApiResponse.success(res, result);
  });

  getFamily = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCatalogService.getFamily(id);
    return ApiResponse.success(res, result);
  });

  createFamily = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminCatalogService.createFamily(req.body as CreateFamilyInput);
    return ApiResponse.created(res, result, 'Family created');
  });

  updateFamily = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCatalogService.updateFamily(id, req.body as UpdateFamilyInput);
    return ApiResponse.success(res, result, 'Family updated');
  });

  deleteFamily = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCatalogService.deleteFamily(id);
    return ApiResponse.success(res, result, 'Family deleted');
  });

  reorderFamilies = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminCatalogService.reorderFamilies(req.body as ReorderCatalogInput);
    return ApiResponse.success(res, result, 'Families reordered');
  });

  // Series
  listSeries = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminCatalogService.listSeries(req.validatedQuery as ListSeriesQuery);
    return ApiResponse.success(res, result);
  });

  getSeries = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCatalogService.getSeries(id);
    return ApiResponse.success(res, result);
  });

  createSeries = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminCatalogService.createSeries(req.body as CreateSeriesInput);
    return ApiResponse.created(res, result, 'Series created');
  });

  updateSeries = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCatalogService.updateSeries(id, req.body as UpdateSeriesInput);
    return ApiResponse.success(res, result, 'Series updated');
  });

  deleteSeries = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCatalogService.deleteSeries(id);
    return ApiResponse.success(res, result, 'Series deleted');
  });

  reorderSeries = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminCatalogService.reorderSeries(req.body as ReorderCatalogInput);
    return ApiResponse.success(res, result, 'Series reordered');
  });

  getCatalogExplorer = asyncHandler(async (_req: Request, res: Response) => {
    const result = await adminCatalogService.getCatalogExplorer();
    return ApiResponse.success(res, result);
  });
}

export const adminProductsController = new AdminProductsController();

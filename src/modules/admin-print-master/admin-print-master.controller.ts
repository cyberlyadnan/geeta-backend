import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminPrintMasterService } from './admin-print-master.service.js';

function actorId(req: Request) {
  return req.user?.id;
}

export class AdminPrintMasterController {
  dashboard = asyncHandler(async (_req: Request, res: Response) => {
    const stats = await adminPrintMasterService.getDashboardStats();
    return ApiResponse.success(res, stats);
  });

  activity = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as { entityType?: string; limit?: number } | undefined;
    const entityType = query?.entityType;
    const limit = query?.limit ?? 50;
    const items = await adminPrintMasterService.listActivity(entityType, limit);
    return ApiResponse.success(res, items);
  });

  listUnits = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPrintMasterService.listUnits(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  createUnit = asyncHandler(async (req: Request, res: Response) => {
    const item = await adminPrintMasterService.createUnit(req.body, { actorId: actorId(req) });
    return ApiResponse.created(res, item);
  });

  updateUnit = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.updateUnit(id, req.body, { actorId: actorId(req) });
    return ApiResponse.success(res, item);
  });

  deleteUnit = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    await adminPrintMasterService.deleteUnit(id, { actorId: actorId(req) });
    return ApiResponse.success(res, { deleted: true });
  });

  listSheetSizes = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPrintMasterService.listSheetSizes(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  getSheetSize = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.getSheetSize(id);
    return ApiResponse.success(res, item);
  });

  createSheetSize = asyncHandler(async (req: Request, res: Response) => {
    const item = await adminPrintMasterService.createSheetSize(req.body, { actorId: actorId(req) });
    return ApiResponse.created(res, item);
  });

  updateSheetSize = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.updateSheetSize(id, req.body, { actorId: actorId(req) });
    return ApiResponse.success(res, item);
  });

  duplicateSheetSize = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.duplicateSheetSize(id, { actorId: actorId(req) });
    return ApiResponse.created(res, item);
  });

  bulkSheetSizeStatus = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPrintMasterService.bulkSheetSizeStatus(
      req.body.ids,
      req.body.status,
      { actorId: actorId(req) },
    );
    return ApiResponse.success(res, result);
  });

  deleteSheetSize = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    await adminPrintMasterService.deleteSheetSize(id, { actorId: actorId(req) });
    return ApiResponse.success(res, { deleted: true });
  });

  listSizeTemplates = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPrintMasterService.listSizeTemplates(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  getSizeTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.getSizeTemplate(id);
    return ApiResponse.success(res, item);
  });

  createSizeTemplate = asyncHandler(async (req: Request, res: Response) => {
    const item = await adminPrintMasterService.createSizeTemplate(req.body, { actorId: actorId(req) });
    return ApiResponse.created(res, item);
  });

  updateSizeTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.updateSizeTemplate(id, req.body, {
      actorId: actorId(req),
    });
    return ApiResponse.success(res, item);
  });

  duplicateSizeTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.duplicateSizeTemplate(id, { actorId: actorId(req) });
    return ApiResponse.created(res, item);
  });

  deleteSizeTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    await adminPrintMasterService.deleteSizeTemplate(id, { actorId: actorId(req) });
    return ApiResponse.success(res, { deleted: true });
  });

  listPrintProcesses = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPrintMasterService.listPrintProcesses(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  createPrintProcess = asyncHandler(async (req: Request, res: Response) => {
    const item = await adminPrintMasterService.createPrintProcess(req.body, { actorId: actorId(req) });
    return ApiResponse.created(res, item);
  });

  updatePrintProcess = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.updatePrintProcess(id, req.body, {
      actorId: actorId(req),
    });
    return ApiResponse.success(res, item);
  });

  deletePrintProcess = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    await adminPrintMasterService.deletePrintProcess(id, { actorId: actorId(req) });
    return ApiResponse.success(res, { deleted: true });
  });

  listPrintSpecTemplates = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPrintMasterService.listPrintSpecTemplates(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  createPrintSpecTemplate = asyncHandler(async (req: Request, res: Response) => {
    const item = await adminPrintMasterService.createPrintSpecTemplate(req.body, { actorId: actorId(req) });
    return ApiResponse.created(res, item);
  });

  updatePrintSpecTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.updatePrintSpecTemplate(id, req.body, {
      actorId: actorId(req),
    });
    return ApiResponse.success(res, item);
  });

  deletePrintSpecTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    await adminPrintMasterService.deletePrintSpecTemplate(id, { actorId: actorId(req) });
    return ApiResponse.success(res, { deleted: true });
  });

  listArtworkRules = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPrintMasterService.listArtworkRules(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  createArtworkRule = asyncHandler(async (req: Request, res: Response) => {
    const item = await adminPrintMasterService.createArtworkRule(req.body, { actorId: actorId(req) });
    return ApiResponse.created(res, item);
  });

  updateArtworkRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.updateArtworkRule(id, req.body, {
      actorId: actorId(req),
    });
    return ApiResponse.success(res, item);
  });

  deleteArtworkRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    await adminPrintMasterService.deleteArtworkRule(id, { actorId: actorId(req) });
    return ApiResponse.success(res, { deleted: true });
  });

  listValidationRules = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPrintMasterService.listValidationRules(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  createValidationRule = asyncHandler(async (req: Request, res: Response) => {
    const item = await adminPrintMasterService.createValidationRule(req.body, { actorId: actorId(req) });
    return ApiResponse.created(res, item);
  });

  updateValidationRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.updateValidationRule(id, req.body, {
      actorId: actorId(req),
    });
    return ApiResponse.success(res, item);
  });

  deleteValidationRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    await adminPrintMasterService.deleteValidationRule(id, { actorId: actorId(req) });
    return ApiResponse.success(res, { deleted: true });
  });

  listCoverageRules = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPrintMasterService.listCoverageRules(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  createCoverageRule = asyncHandler(async (req: Request, res: Response) => {
    const item = await adminPrintMasterService.createCoverageRule(req.body, { actorId: actorId(req) });
    return ApiResponse.created(res, item);
  });

  updateCoverageRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.updateCoverageRule(id, req.body, {
      actorId: actorId(req),
    });
    return ApiResponse.success(res, item);
  });

  deleteCoverageRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    await adminPrintMasterService.deleteCoverageRule(id, { actorId: actorId(req) });
    return ApiResponse.success(res, { deleted: true });
  });

  listFileUploadRules = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPrintMasterService.listFileUploadRules(req.validatedQuery as never);
    return ApiResponse.success(res, result);
  });

  createFileUploadRule = asyncHandler(async (req: Request, res: Response) => {
    const item = await adminPrintMasterService.createFileUploadRule(req.body, { actorId: actorId(req) });
    return ApiResponse.created(res, item);
  });

  updateFileUploadRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const item = await adminPrintMasterService.updateFileUploadRule(id, req.body, {
      actorId: actorId(req),
    });
    return ApiResponse.success(res, item);
  });

  deleteFileUploadRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    await adminPrintMasterService.deleteFileUploadRule(id, { actorId: actorId(req) });
    return ApiResponse.success(res, { deleted: true });
  });

  getProductPrintConfig = asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedParams as { versionId: string };
    const config = await adminPrintMasterService.getProductPrintConfig(versionId);
    return ApiResponse.success(res, config);
  });

  assignProductPrintConfig = asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedParams as { versionId: string };
    const config = await adminPrintMasterService.assignProductPrintConfig(
      versionId,
      req.body,
      { actorId: actorId(req) },
    );
    return ApiResponse.success(res, config);
  });
}

export const adminPrintMasterController = new AdminPrintMasterController();

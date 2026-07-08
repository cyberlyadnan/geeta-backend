import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { printJobService } from './services/print-job.service.js';
import { adminPrintEngineService } from './services/admin-print-engine.service.js';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { storageService } from '../../services/storage/storage.service.js';

export const printJobController = {
  getContext: asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedParams as { versionId: string };
    const data = await printJobService.getContext(versionId);
    res.json({ success: true, data });
  }),

  resolveSize: asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedParams as { versionId: string };
    const data = await printJobService.resolveSize(versionId, req.body);
    res.json({ success: true, data });
  }),

  presignArtwork: asyncHandler(async (req: Request, res: Response) => {
    const data = await printJobService.createArtworkPresign(req.user!.id, req.body);
    res.json({ success: true, data });
  }),

  registerArtwork: asyncHandler(async (req: Request, res: Response) => {
    const data = await printJobService.registerArtwork(req.user!.id, req.body);
    res.status(201).json({ success: true, data });
  }),

  uploadArtworkMultipart: asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      throw ApiError.badRequest('Artwork file is required');
    }

    const { versionId, requirementCode, size } = req.body as {
      versionId: string;
      requirementCode: string;
      size?: string;
    };
    const parsedSize =
      typeof size === 'string' && size.trim().length > 0
        ? JSON.parse(size)
        : typeof size === 'object' && size
          ? size
          : undefined;

    try {
      const data = await printJobService.uploadArtworkMultipart(req.user!.id, {
        versionId,
        requirementCode,
        size: parsedSize,
        filePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      res.status(201).json({ success: true, data });
    } finally {
      const { unlink } = await import('node:fs/promises');
      await unlink(file.path).catch(() => undefined);
    }
  }),

  getArtworkStatus: asyncHandler(async (req: Request, res: Response) => {
    const { artworkVersionId } = req.validatedParams as { artworkVersionId: string };
    const data = await printJobService.getArtworkStatus(artworkVersionId, req.user!.id);
    res.json({ success: true, data });
  }),

  calculatePricing: asyncHandler(async (req: Request, res: Response) => {
    const data = await printJobService.calculateLivePricing(req.user!.id, req.body);
    res.json({ success: true, data });
  }),
};

export const adminPrintEngineController = {
  getConfig: asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedParams as { versionId: string };
    const data = await adminPrintEngineService.getEngineConfig(versionId);
    res.json({ success: true, data });
  }),

  upsertPrintSpec: asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedParams as { versionId: string };
    const data = await adminPrintEngineService.upsertPrintSpecification(versionId, req.body);
    res.json({ success: true, data });
  }),

  upsertSizeStrategy: asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedParams as { versionId: string };
    const data = await adminPrintEngineService.upsertSizeStrategy(versionId, req.body);
    res.json({ success: true, data });
  }),

  createSizeConfig: asyncHandler(async (req: Request, res: Response) => {
    const { strategyId } = req.validatedParams as { strategyId: string };
    const data = await adminPrintEngineService.createSizeConfiguration(strategyId, req.body);
    res.status(201).json({ success: true, data });
  }),

  deleteSizeConfig: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    await adminPrintEngineService.deleteSizeConfiguration(id);
    res.json({ success: true, message: 'Size configuration deleted' });
  }),

  createFileRequirement: asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedParams as { versionId: string };
    const data = await adminPrintEngineService.createFileRequirement(versionId, req.body);
    res.status(201).json({ success: true, data });
  }),

  createPrintLayer: asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedParams as { versionId: string };
    const data = await adminPrintEngineService.createPrintLayer(versionId, req.body);
    res.status(201).json({ success: true, data });
  }),

  createCoverageRule: asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedParams as { versionId: string };
    const data = await adminPrintEngineService.createCoveragePricingRule(versionId, req.body);
    res.status(201).json({ success: true, data });
  }),
};

export const productionArtworkController = {
  listOrderArtwork: asyncHandler(async (req: Request, res: Response) => {
    const { orderItemId } = req.validatedParams as { orderItemId: string };
    const items = await prisma.orderArtwork.findMany({
      where: { orderItemId: orderItemId },
      include: {
        artworkFile: { include: { fileAsset: true } },
        pinnedVersion: {
          include: {
            artworkVersion: {
              include: { metadata: true, validation: true, coverageAnalyses: true },
            },
          },
        },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json({ success: true, data: items });
  }),

  updateApproval: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const { status, adminNotes } = req.body as {
      status: 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';
      adminNotes?: string;
    };

    const updated = await prisma.orderArtwork.update({
      where: { id },
      data: {
        approvalStatus: status,
        adminNotes,
        approvedById: req.user!.id,
        approvedAt: new Date(),
      },
    });
    res.json({ success: true, data: updated });
  }),

  downloadOriginal: asyncHandler(async (req: Request, res: Response) => {
    const { artworkVersionId } = req.validatedParams as { artworkVersionId: string };
    const version = await prisma.artworkVersion.findUnique({
      where: { id: artworkVersionId },
      include: { fileAsset: true },
    });
    if (!version) throw ApiError.notFound('Artwork version not found');

    const download = await storageService.createPresignedDownload(version.fileAsset.fileKey, {
      fileName: version.fileAsset.originalName,
      mimeType: version.fileAsset.mimeType,
    });
    res.json({ success: true, data: download });
  }),
};

import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { printJobService } from './services/print-job.service.js';
import { adminPrintEngineService } from './services/admin-print-engine.service.js';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { storageService } from '../../services/storage/storage.service.js';
import { productionArtworkService } from '../production/artwork/production-artwork.service.js';
import { notifyUser, recordOrderEvent } from '../orders/order-events.service.js';
import { workflowEngine } from '../workflow/workflow.engine.js';

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

  deleteFileRequirement: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const data = await adminPrintEngineService.deleteFileRequirement(id);
    res.json({ success: true, data });
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

    // Load the order the vendor owns *before* the write, so a notification failure never leaves
    // the update in place without one — the transaction covers both.
    const artwork = await prisma.orderArtwork.findUnique({
      where: { id },
      select: {
        orderItem: {
          select: {
            order: { select: { id: true, orderNumber: true, customerId: true } },
            productOfferingVersion: {
              select: { productOffering: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!artwork) throw ApiError.notFound('Artwork not found');
    const order = artwork.orderItem.order;
    const productName = artwork.orderItem.productOfferingVersion.productOffering.name;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.orderArtwork.update({
        where: { id },
        data: {
          approvalStatus: status,
          adminNotes,
          approvedById: req.user!.id,
          approvedAt: new Date(),
          // The verifier has now acted on whatever was resubmitted (or was never resubmitted at
          // all) — clear the flag so a future fresh PENDING never reads as "changes made".
          resubmittedAt: null,
        },
      });

      // The verifier↔vendor loop: revision request must reach the vendor as both a persistent
      // notification (they may be offline) and an entry on the order's own timeline. Approve /
      // reject go on the timeline too so the vendor can see what happened without asking.
      const eventTitle =
        status === 'REVISION_REQUESTED'
          ? 'Changes requested on your artwork'
          : status === 'APPROVED'
            ? 'Artwork approved'
            : 'Artwork rejected';
      await recordOrderEvent(
        order.id,
        {
          eventType: `ARTWORK_${status}`,
          title: eventTitle,
          description: adminNotes ?? undefined,
          metadata: { orderArtworkId: id, product: productName },
          actorId: req.user!.id,
        },
        tx,
      );

      // Only revision requests need a push — approvals and rejections are visible on the order
      // page but the vendor does not have to act on them urgently. Retail (walk-in) orders have
      // no customer user and simply skip the notification — the order is still logged.
      if (status === 'REVISION_REQUESTED' && order.customerId) {
        await notifyUser(
          order.customerId,
          {
            type: 'ARTWORK_REVISION_REQUESTED',
            title: `Changes needed on ${order.orderNumber}`,
            body:
              adminNotes?.trim() ||
              `Verification asked for a revision on ${productName}. Open the order to upload a new file.`,
            entityType: 'ORDER',
            entityId: order.id,
            metadata: { orderArtworkId: id },
          },
          tx,
        );
      }

      return row;
    });
    res.json({ success: true, data: updated });
  }),

  downloadOriginal: asyncHandler(async (req: Request, res: Response) => {
    const { artworkVersionId } = req.validatedParams as { artworkVersionId: string };
    await productionArtworkService.assertArtworkVersionAccessible(artworkVersionId);

    const version = await prisma.artworkVersion.findUnique({
      where: { id: artworkVersionId },
      include: { fileAsset: true },
    });
    if (!version) throw ApiError.notFound('Artwork version not found');

    const download = await storageService.createPresignedDownload(version.fileAsset.fileKey, {
      fileName: version.fileAsset.originalName,
      mimeType: version.fileAsset.mimeType,
      disposition: 'attachment',
    });
    res.json({
      success: true,
      data: { ...download, fileName: version.fileAsset.originalName },
    });
  }),

  getOrderArtworkInspection: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const data = await productionArtworkService.getOrderArtworkInspection(id);
    res.json({ success: true, data });
  }),

  /**
   * Vendor re-uploads a file the verifier asked them to revise. Same replace pipeline the
   * production staff use, gated by ownership: a vendor may only replace artwork on their own
   * order. The revision status is reset to PENDING so the verifier's queue picks it up again.
   */
  resubmitOrderArtworkForVendor: asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) throw ApiError.badRequest('Artwork file is required');

    const { id } = req.validatedParams as { id: string };
    const owned = await prisma.orderArtwork.findFirst({
      where: { id, orderItem: { order: { customerId: req.user!.id } } },
      select: { id: true, orderItem: { select: { order: { select: { id: true, orderNumber: true } } } } },
    });
    if (!owned) throw ApiError.notFound('Order artwork not found');

    const orderId = owned.orderItem.order.id;
    const orderNumber = owned.orderItem.order.orderNumber;

    // Capture before replace — replaceOrderArtwork clears approvedById, and that id is who
    // we need to ping when the vendor sends a corrected file.
    const previous = await prisma.orderArtwork.findUnique({
      where: { id },
      select: { approvedById: true },
    });

    try {
      const data = await productionArtworkService.replaceOrderArtwork(id, req.user!.id, {
        filePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
        markResubmitted: true,
      });
      // Mark any pending ARTWORK_REVISION_REQUESTED notifications for this vendor & order as read
      await prisma.userNotification.updateMany({
        where: {
          userId: req.user!.id,
          type: 'ARTWORK_REVISION_REQUESTED',
          isRead: false,
          entityId: owned.orderItem.order.id,
        },
        data: { isRead: true },
      });
      await recordOrderEvent(orderId, {
        eventType: 'ARTWORK_RESUBMITTED',
        title: 'Vendor uploaded revised artwork',
        actorId: req.user!.id,
      });

      const verificationTask = await prisma.workflowTask.findFirst({
        where: {
          workflowStep: { stepType: 'VERIFICATION' },
          workflowInstance: { orderId },
          status: { notIn: ['COMPLETED', 'CANCELLED', 'SKIPPED'] },
        },
        select: { id: true, status: true },
        orderBy: { stepOrder: 'desc' },
      });

      // If the verifier flagged this order for correction the task sits BLOCKED — bring it
      // back to READY automatically when the vendor uploads a fix.
      if (verificationTask?.status === 'BLOCKED') {
        await workflowEngine.resolveTaskCorrection({
          taskId: verificationTask.id,
          actorId: req.user!.id,
          remarks: 'Vendor uploaded revised artwork',
        });
      }

      // Notify whoever needs to look at it again: the staff member who asked for the revision,
      // plus anyone currently assigned to a live task on this order. Using a Set means a
      // verifier who is both doesn't get two copies.
      const recipients = new Set<string>();
      if (previous?.approvedById) recipients.add(previous.approvedById);

      const activeAssignments = await prisma.workflowTaskAssignment.findMany({
        where: {
          status: 'ACTIVE',
          workflowTask: {
            status: { notIn: ['COMPLETED', 'CANCELLED', 'SKIPPED'] },
            workflowInstance: { orderId },
          },
        },
        select: { operatorId: true },
      });
      for (const assignment of activeAssignments) recipients.add(assignment.operatorId);

      for (const userId of recipients) {
        await notifyUser(userId, {
          type: 'ARTWORK_RESUBMITTED',
          title: `${orderNumber}: revised artwork ready`,
          body: 'The vendor uploaded a new file. Open the task to review and approve.',
          entityType: verificationTask ? 'workflow_task' : 'ORDER',
          entityId: verificationTask?.id ?? orderId,
          metadata: { orderId },
        });
      }
      res.status(201).json({ success: true, data });
    } finally {
      const { unlink } = await import('node:fs/promises');
      await unlink(file.path).catch(() => undefined);
    }
  }),

  replaceOrderArtwork: asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) throw ApiError.badRequest('Artwork file is required');

    const { id } = req.validatedParams as { id: string };
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;

    try {
      const data = await productionArtworkService.replaceOrderArtwork(id, req.user!.id, {
        filePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        notes,
      });
      res.status(201).json({ success: true, data });
    } finally {
      const { unlink } = await import('node:fs/promises');
      await unlink(file.path).catch(() => undefined);
    }
  }),
};

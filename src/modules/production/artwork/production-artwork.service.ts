import { ArtworkApprovalStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ApiError } from '../../../common/errors/ApiError.js';
import { storageService } from '../../../services/storage/storage.service.js';
import {
  assertValidArtworkUpload,
  buildArtworkObjectKey,
  buildPublicUrl,
  normalizeArtworkContentType,
} from '../../../services/storage/storage.utils.js';
import { assertR2Config } from '../../../services/storage/storage.provider.js';
import { printJobService } from '../../print-engine/services/print-job.service.js';
import { workflowTimelineService } from '../../workflow/workflow-timeline.service.js';

export class ProductionArtworkService {
  async getOrderArtworkInspection(orderArtworkId: string) {
    const orderArtwork = await this.findOrderArtworkOrThrow(orderArtworkId);
    const artworkVersionId = orderArtwork.pinnedVersion?.artworkVersionId;
    if (!artworkVersionId) {
      throw ApiError.notFound('No artwork version pinned on this order');
    }

    return printJobService.getArtworkStatusUnscoped(artworkVersionId);
  }

  async replaceOrderArtwork(
    orderArtworkId: string,
    operatorUserId: string,
    input: {
      filePath: string;
      originalName: string;
      mimeType: string;
      fileSize: number;
      notes?: string;
    },
  ) {
    const orderArtwork = await prisma.orderArtwork.findUnique({
      where: { id: orderArtworkId },
      include: {
        artworkFile: {
          include: {
            fileRequirement: true,
          },
        },
        pinnedVersion: true,
        orderItem: {
          select: {
            id: true,
            workflowInstance: { select: { id: true } },
          },
        },
      },
    });

    if (!orderArtwork) throw ApiError.notFound('Order artwork not found');

    const artworkFile = orderArtwork.artworkFile;
    const productVersionId = artworkFile.versionId;
    if (!productVersionId) {
      throw ApiError.conflict('Artwork file is missing product version context');
    }

    const requirement = artworkFile.fileRequirement;
    const contentType = normalizeArtworkContentType(input.mimeType, input.originalName);
    assertValidArtworkUpload(
      contentType,
      input.fileSize,
      input.originalName,
      requirement?.maxFileSizeMb ?? undefined,
    );

    const key = buildArtworkObjectKey(
      operatorUserId,
      productVersionId,
      input.originalName,
      contentType,
    );

    await storageService.putArtworkObjectFromFile({
      key,
      filePath: input.filePath,
      contentType,
      fileSize: input.fileSize,
    });

    const config = assertR2Config();
    const ext = input.originalName.split('.').pop()?.toLowerCase() ?? 'bin';
    const publicUrl = buildPublicUrl(config.publicUrl, key);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const fileAsset = await tx.fileAsset.create({
        data: {
          originalName: input.originalName,
          fileName: input.originalName,
          fileKey: key,
          fileUrl: publicUrl,
          mimeType: contentType,
          extension: ext,
          fileSize: input.fileSize,
          uploadedById: operatorUserId,
        },
      });

      const versionNumber = artworkFile.currentVersion + 1;
      await tx.artworkFile.update({
        where: { id: artworkFile.id },
        data: {
          currentVersion: versionNumber,
          processingStatus: 'PENDING',
        },
      });

      const artworkVersion = await tx.artworkVersion.create({
        data: {
          artworkFileId: artworkFile.id,
          versionNumber,
          fileAssetId: fileAsset.id,
          processingStatus: 'PENDING',
        },
      });

      await tx.orderArtworkVersion.upsert({
        where: { orderArtworkId },
        create: {
          orderArtworkId,
          artworkVersionId: artworkVersion.id,
          pinnedAt: now,
        },
        update: {
          artworkVersionId: artworkVersion.id,
          pinnedAt: now,
        },
      });

      await tx.orderArtwork.update({
        where: { id: orderArtworkId },
        data: {
          approvalStatus: ArtworkApprovalStatus.PENDING,
          adminNotes: input.notes ?? null,
          approvedById: null,
          approvedAt: null,
        },
      });

      return {
        artworkFileId: artworkFile.id,
        artworkVersionId: artworkVersion.id,
        versionNumber,
      };
    });

    await printJobService.enqueueArtworkProcessingForVersion(
      result.artworkVersionId,
      productVersionId,
      operatorUserId,
    );

    const workflowInstanceId = orderArtwork.orderItem.workflowInstance?.id;
    if (workflowInstanceId) {
      await prisma.$transaction(async (tx) => {
        await workflowTimelineService.recordEvents(
          [
            {
              workflowInstanceId,
              entityType: 'WORKFLOW_INSTANCE',
              entityId: workflowInstanceId,
              eventType: 'ARTWORK_REPLACED',
              title: 'Artwork replaced',
              description:
                input.notes?.trim() ||
                `Corrected artwork uploaded (${input.originalName})`,
              metadata: {
                orderArtworkId,
                artworkVersionId: result.artworkVersionId,
                versionNumber: result.versionNumber,
              } as Prisma.InputJsonValue,
              actorId: operatorUserId,
            },
          ],
          tx,
        );
      });
    }

    return result;
  }

  async assertArtworkVersionAccessible(artworkVersionId: string) {
    const linked = await prisma.orderArtworkVersion.findFirst({
      where: { artworkVersionId },
      select: { id: true },
    });
    if (!linked) {
      throw ApiError.notFound('Artwork version not found on a production order');
    }
  }

  private async findOrderArtworkOrThrow(orderArtworkId: string) {
    const orderArtwork = await prisma.orderArtwork.findUnique({
      where: { id: orderArtworkId },
      include: {
        pinnedVersion: { select: { artworkVersionId: true } },
      },
    });
    if (!orderArtwork) throw ApiError.notFound('Order artwork not found');
    return orderArtwork;
  }
}

export const productionArtworkService = new ProductionArtworkService();

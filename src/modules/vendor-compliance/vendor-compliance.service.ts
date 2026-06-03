import {
  ActivityAction,
  VendorAccountStatus,
  VendorComplianceItemType,
  VendorComplianceRequestStatus,
  VendorComplianceResponseStatus,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { activityLogService } from '../../services/activity/index.js';
import { storageService } from '../../services/storage/storage.service.js';
import type {
  CreateComplianceRequestInput,
  SubmitComplianceInput,
  VendorCompliancePresignInput,
} from './vendor-compliance.validation.js';

const REQUEST_INCLUDE = {
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      responses: {
        include: {
          fileAsset: true,
          reviewedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
    },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  reviewedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.VendorComplianceRequestInclude;

export class VendorComplianceService {
  private async generateReferenceCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.vendorComplianceRequest.count({
      where: {
        createdAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
        },
      },
    });
    return `VCR-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private async assertVendorProfile(vendorId: string) {
    const profile = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
    if (!profile) {
      throw ApiError.notFound('Vendor not found');
    }
    return profile;
  }

  private async assertVendorByPhone(phone: string) {
    const user = await prisma.user.findFirst({
      where: { phone, deletedAt: null },
      include: { vendorProfile: true },
    });
    if (!user?.vendorProfile) {
      throw ApiError.notFound('No registration found for this mobile number');
    }
    return { user, profile: user.vendorProfile };
  }

  async listByVendor(vendorId: string) {
    await this.assertVendorProfile(vendorId);
    return prisma.vendorComplianceRequest.findMany({
      where: { vendorProfileId: vendorId },
      orderBy: { createdAt: 'desc' },
      include: REQUEST_INCLUDE,
    });
  }

  async getById(vendorId: string, requestId: string) {
    const request = await prisma.vendorComplianceRequest.findFirst({
      where: { id: requestId, vendorProfileId: vendorId },
      include: REQUEST_INCLUDE,
    });
    if (!request) {
      throw ApiError.notFound('Compliance request not found');
    }
    return request;
  }

  async create(
    vendorId: string,
    input: CreateComplianceRequestInput,
    adminId: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    await this.assertVendorProfile(vendorId);

    const referenceCode = await this.generateReferenceCode();

    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.vendorComplianceRequest.create({
        data: {
          vendorProfileId: vendorId,
          referenceCode,
          title: input.title,
          instructions: input.instructions,
          dueAt: input.dueAt,
          createdById: adminId,
          status: VendorComplianceRequestStatus.DRAFT,
          items: {
            create: input.items.map((item, index) => ({
              itemType: item.itemType,
              code: item.code,
              label: item.label,
              description: item.description,
              isRequired: item.isRequired,
              sortOrder: item.sortOrder ?? index,
              maxFileSizeMb: item.maxFileSizeMb,
              acceptedFileTypes: item.acceptedFileTypes ?? [],
            })),
          },
        },
        include: REQUEST_INCLUDE,
      });

      if (input.sendImmediately) {
        return this.sendInternal(tx, created.id, vendorId, adminId, input.instructions);
      }

      return created;
    });

    await activityLogService.log({
      action: ActivityAction.VENDOR_COMPLIANCE_REQUEST_CREATED,
      entityType: 'vendor_compliance_request',
      entityId: request.id,
      vendorProfileId: vendorId,
      actorId: adminId,
      metadata: {
        referenceCode: request.referenceCode,
        itemCount: input.items.length,
        sent: input.sendImmediately,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    if (input.sendImmediately) {
      await activityLogService.log({
        action: ActivityAction.VENDOR_COMPLIANCE_REQUEST_SENT,
        entityType: 'vendor_compliance_request',
        entityId: request.id,
        vendorProfileId: vendorId,
        actorId: adminId,
        metadata: { referenceCode: request.referenceCode },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      });
    }

    return request;
  }

  private async sendInternal(
    tx: Prisma.TransactionClient,
    requestId: string,
    vendorId: string,
    _adminId: string,
    instructions?: string,
  ) {
    const now = new Date();
    await tx.vendorProfile.update({
      where: { id: vendorId },
      data: {
        accountStatus: VendorAccountStatus.DOCUMENT_REQUIRED,
        verificationRemarks:
          instructions ??
          'Additional documents or information are required. Please submit via the status page.',
      },
    });

    return tx.vendorComplianceRequest.update({
      where: { id: requestId },
      data: {
        status: VendorComplianceRequestStatus.PENDING_VENDOR,
        sentAt: now,
      },
      include: REQUEST_INCLUDE,
    });
  }

  async send(
    vendorId: string,
    requestId: string,
    adminId: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const existing = await this.getById(vendorId, requestId);
    if (existing.status !== VendorComplianceRequestStatus.DRAFT) {
      throw ApiError.badRequest('Only draft requests can be sent');
    }
    if (existing.items.length === 0) {
      throw ApiError.badRequest('Request must have at least one item');
    }

    const request = await prisma.$transaction((tx) =>
      this.sendInternal(tx, requestId, vendorId, adminId, existing.instructions ?? undefined),
    );

    await activityLogService.log({
      action: ActivityAction.VENDOR_COMPLIANCE_REQUEST_SENT,
      entityType: 'vendor_compliance_request',
      entityId: requestId,
      vendorProfileId: vendorId,
      actorId: adminId,
      metadata: { referenceCode: request.referenceCode },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return request;
  }

  async cancel(
    vendorId: string,
    requestId: string,
    adminId: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const existing = await this.getById(vendorId, requestId);
    if (
      existing.status === VendorComplianceRequestStatus.CANCELLED ||
      existing.status === VendorComplianceRequestStatus.COMPLETED
    ) {
      throw ApiError.badRequest('Request cannot be cancelled');
    }

    const request = await prisma.vendorComplianceRequest.update({
      where: { id: requestId },
      data: {
        status: VendorComplianceRequestStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: REQUEST_INCLUDE,
    });

    await activityLogService.log({
      action: ActivityAction.VENDOR_STATUS_CHANGED,
      entityType: 'vendor_compliance_request',
      entityId: requestId,
      vendorProfileId: vendorId,
      actorId: adminId,
      metadata: { action: 'cancelled', referenceCode: request.referenceCode },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return request;
  }

  async reviewResponse(
    vendorId: string,
    responseId: string,
    status: 'APPROVED' | 'REJECTED',
    adminRemarks: string | undefined,
    adminId: string,
  ) {
    const response = await prisma.vendorComplianceResponse.findFirst({
      where: { id: responseId, vendorProfileId: vendorId },
      include: { requestItem: { include: { request: true } } },
    });
    if (!response) {
      throw ApiError.notFound('Response not found');
    }

    return prisma.vendorComplianceResponse.update({
      where: { id: responseId },
      data: {
        status,
        adminRemarks,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
      include: {
        fileAsset: true,
        reviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        requestItem: true,
      },
    });
  }

  async presignUpload(input: VendorCompliancePresignInput) {
    const { profile } = await this.assertVendorByPhone(input.phone);

    const item = await prisma.vendorComplianceRequestItem.findFirst({
      where: {
        id: input.requestItemId,
        itemType: VendorComplianceItemType.DOCUMENT,
        request: {
          vendorProfileId: profile.id,
          status: {
            in: [
              VendorComplianceRequestStatus.PENDING_VENDOR,
              VendorComplianceRequestStatus.PARTIALLY_SUBMITTED,
            ],
          },
        },
      },
    });

    if (!item) {
      throw ApiError.notFound('Document request item not found or not open for submission');
    }

    return storageService.createPresignedVendorComplianceUpload(
      profile.id,
      input.fileName,
      input.contentType,
      input.fileSize,
    );
  }

  async submit(input: SubmitComplianceInput) {
    const { profile } = await this.assertVendorByPhone(input.phone);

    const request = await prisma.vendorComplianceRequest.findFirst({
      where: {
        id: input.requestId,
        vendorProfileId: profile.id,
        status: {
          in: [
            VendorComplianceRequestStatus.PENDING_VENDOR,
            VendorComplianceRequestStatus.PARTIALLY_SUBMITTED,
          ],
        },
      },
      include: {
        items: true,
      },
    });

    if (!request) {
      throw ApiError.notFound('Compliance request not found or already closed');
    }

    const itemMap = new Map(request.items.map((i) => [i.id, i]));

    for (const entry of input.responses) {
      const item = itemMap.get(entry.itemId);
      if (!item) {
        throw ApiError.badRequest(`Invalid item: ${entry.itemId}`);
      }
      if (item.itemType !== entry.itemType) {
        throw ApiError.badRequest(`Item type mismatch for ${item.label}`);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const entry of input.responses) {
        if (entry.itemType === VendorComplianceItemType.QUESTION) {
          await tx.vendorComplianceResponse.upsert({
            where: {
              requestItemId_vendorProfileId: {
                requestItemId: entry.itemId,
                vendorProfileId: profile.id,
              },
            },
            create: {
              requestItemId: entry.itemId,
              vendorProfileId: profile.id,
              textAnswer: entry.textAnswer,
              status: VendorComplianceResponseStatus.SUBMITTED,
            },
            update: {
              textAnswer: entry.textAnswer,
              status: VendorComplianceResponseStatus.SUBMITTED,
              submittedAt: new Date(),
            },
          });
        } else {
          const fileAsset = await tx.fileAsset.create({
            data: {
              originalName: entry.originalName,
              fileName: entry.originalName,
              fileKey: entry.fileKey,
              fileUrl: entry.fileUrl,
              mimeType: entry.mimeType,
              extension: entry.extension,
              fileSize: entry.fileSize,
            },
          });

          await tx.vendorComplianceResponse.upsert({
            where: {
              requestItemId_vendorProfileId: {
                requestItemId: entry.itemId,
                vendorProfileId: profile.id,
              },
            },
            create: {
              requestItemId: entry.itemId,
              vendorProfileId: profile.id,
              fileAssetId: fileAsset.id,
              status: VendorComplianceResponseStatus.SUBMITTED,
            },
            update: {
              fileAssetId: fileAsset.id,
              status: VendorComplianceResponseStatus.SUBMITTED,
              submittedAt: new Date(),
            },
          });
        }
      }

      const refreshed = await tx.vendorComplianceRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: { items: { include: { responses: true } } },
      });

      const requiredItems = refreshed.items.filter((i) => i.isRequired);
      const allRequiredDone = requiredItems.every((i) =>
        i.responses.some(
          (r) =>
            r.vendorProfileId === profile.id &&
            (r.textAnswer || r.fileAssetId) &&
            r.status !== VendorComplianceResponseStatus.PENDING,
        ),
      );

      const anySubmitted = refreshed.items.some((i) =>
        i.responses.some((r) => r.vendorProfileId === profile.id && (r.textAnswer || r.fileAssetId)),
      );

      let nextStatus = refreshed.status;
      if (allRequiredDone) {
        nextStatus = VendorComplianceRequestStatus.SUBMITTED;
      } else if (anySubmitted) {
        nextStatus = VendorComplianceRequestStatus.PARTIALLY_SUBMITTED;
      }

      await tx.vendorComplianceRequest.update({
        where: { id: request.id },
        data: {
          status: nextStatus,
          submittedAt: allRequiredDone ? new Date() : refreshed.submittedAt,
        },
      });

      if (allRequiredDone) {
        await tx.vendorProfile.update({
          where: { id: profile.id },
          data: { accountStatus: VendorAccountStatus.UNDER_REVIEW },
        });
      }
    });

    await activityLogService.log({
      action: ActivityAction.VENDOR_COMPLIANCE_SUBMITTED,
      entityType: 'vendor_compliance_request',
      entityId: input.requestId,
      vendorProfileId: profile.id,
      metadata: {
        responseCount: input.responses.length,
        referenceCode: request.referenceCode,
      },
    });

    return this.getPendingForVendor(profile.id);
  }

  async getPendingForVendor(vendorProfileId: string) {
    return prisma.vendorComplianceRequest.findMany({
      where: {
        vendorProfileId,
        status: {
          in: [
            VendorComplianceRequestStatus.PENDING_VENDOR,
            VendorComplianceRequestStatus.PARTIALLY_SUBMITTED,
          ],
        },
      },
      orderBy: { sentAt: 'desc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            responses: {
              where: { vendorProfileId },
              include: { fileAsset: true },
            },
          },
        },
      },
    });
  }

  mapRequestForVendorStatus(requests: Awaited<ReturnType<typeof this.getPendingForVendor>>) {
    return requests.map((req) => ({
      id: req.id,
      referenceCode: req.referenceCode,
      title: req.title,
      instructions: req.instructions,
      status: req.status,
      dueAt: req.dueAt,
      sentAt: req.sentAt,
      items: req.items.map((item) => {
        const response = item.responses[0] ?? null;
        return {
          id: item.id,
          itemType: item.itemType,
          label: item.label,
          description: item.description,
          isRequired: item.isRequired,
          maxFileSizeMb: item.maxFileSizeMb,
          acceptedFileTypes: item.acceptedFileTypes,
          response: response
            ? {
                id: response.id,
                textAnswer: response.textAnswer,
                fileUrl: response.fileAsset?.fileUrl ?? null,
                fileName: response.fileAsset?.originalName ?? null,
                status: response.status,
                submittedAt: response.submittedAt,
              }
            : null,
        };
      }),
    }));
  }
}

export const vendorComplianceService = new VendorComplianceService();

import type { FileAsset } from '@prisma/client';

/** Safe file metadata exposed to clients — never includes storage keys or permanent URLs. */
export type SafeFileAssetDto = {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  fileSize: number;
};

export function toSafeFileAsset(asset: FileAsset | null | undefined): SafeFileAssetDto | null {
  if (!asset) return null;
  return {
    id: asset.id,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    extension: asset.extension,
    fileSize: asset.fileSize,
  };
}

type ResponseWithFile = { fileAsset: FileAsset | null };
type ItemWithResponses = { responses: ResponseWithFile[] };
type RequestWithItems = { items: ItemWithResponses[] };

export function sanitizeComplianceRequest<T extends RequestWithItems>(request: T): T {
  return {
    ...request,
    items: request.items.map((item) => ({
      ...item,
      responses: item.responses.map((response) => ({
        ...response,
        fileAsset: toSafeFileAsset(response.fileAsset),
      })),
    })),
  } as T;
}

export function sanitizeComplianceRequests<T extends RequestWithItems>(requests: T[]): T[] {
  return requests.map((r) => sanitizeComplianceRequest(r));
}

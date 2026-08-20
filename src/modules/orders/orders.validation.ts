import { z } from 'zod';

const sizeSchema = z
  .object({
    sizeCode: z.string().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    unit: z.enum(['MM', 'CM', 'INCH', 'FT']).optional(),
  })
  .optional();

const artworkSlotSchema = z.object({
  requirementCode: z.string().min(1),
  artworkFileId: z.string().min(1),
  artworkVersionId: z.string().min(1),
});

const coverageResultSchema = z.object({
  coverageType: z.string(),
  coveragePercent: z.number(),
  coverageMm2: z.number(),
  coverageCm2: z.number(),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  printablePixels: z.number().optional(),
});

const orderConfigurationFields = {
  productId: z.string().min(1),
  versionId: z.string().optional(),
  quantity: z.coerce.number().int().min(1),
  selections: z.record(z.string(), z.string()).default({}),
  size: sizeSchema,
  coverageResults: z.array(coverageResultSchema).optional(),
  artworks: z.array(artworkSlotSchema).optional(),
  orderDeliveryChoice: z.boolean().optional().nullable(),
  deliveryAddress: z.string().max(2000).optional().nullable(),
};

export const orderPreviewSchema = z.object({
  ...orderConfigurationFields,
  fileOption: z.enum(['attach', 'email']).optional(),
});

export const createProductionOrderSchema = z.object({
  ...orderConfigurationFields,
  orderName: z.string().min(1).max(200),
  specialRemark: z.string().max(2000).optional(),
  pressline: z.string().max(200).optional(),
  fileOption: z.enum(['attach', 'email']).optional(),
  draftId: z.string().optional(),
  /**
   * Phase 4 — the raw matter (names, dates, wording) a customer supplies when they want the
   * design team to create the artwork rather than uploading their own.
   */
  designMatter: z.string().max(10_000).optional(),
  /** Pre-uploaded reference material (photos, logos, existing artwork to redo) for the design
   *  team — file ids from the design-attachments presign/register flow, owned by this vendor. */
  designAttachments: z.array(z.string().min(1)).optional(),
  /**
   * Vendor's choice when the product's designServiceMode is OPTIONAL: true asks for design help
   * (matter/attachments are used, no print-ready-artwork question), false/undefined means the
   * vendor is supplying their own finished artwork. Ignored when the mode is NOT_OFFERED or
   * REQUIRED — REQUIRED always routes through design regardless of this flag.
   */
  needsDesignHelp: z.boolean().optional(),
  /**
   * Staff-facing override for local/counter orders: forces a DesignTask regardless of the
   * product's own ProductTypeProfile.designServiceMode. Undefined defers to the product's own
   * mode (the existing vendor self-serve behavior, unchanged).
   */
  designRequired: z.boolean().optional(),
  /** Per-order design fee override — staff-entered, takes precedence over the product's default. */
  designPriceOverride: z.coerce.number().nonnegative().optional(),
});

export const orderIdParamSchema = z.object({
  id: z.string().min(1),
});

export const draftIdParamSchema = z.object({
  draftId: z.string().min(1),
});

export const saveDraftSchema = z.object({
  id: z.string().optional(),
  label: z.string().max(200).optional(),
  step: z.number().int().min(1).max(10).optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().max(100).optional(),
  status: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type OrderPreviewInput = z.infer<typeof orderPreviewSchema>;
export type CreateProductionOrderInput = z.infer<typeof createProductionOrderSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;

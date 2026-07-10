import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import {
  adminPrintEngineController,
  printJobController,
  productionArtworkController,
} from './print-engine.controller.js';
import { artworkMultipartUpload } from './middleware/artwork-upload.middleware.js';
import { withArtworkUpload } from './middleware/artwork-upload.wrapper.js';
import {
  artworkApprovalSchema,
  artworkMultipartBodySchema,
  orderArtworkIdParamSchema,
  artworkPresignSchema,
  artworkRegisterSchema,
  artworkVersionIdParamSchema,
  createCoverageRuleSchema,
  createFileRequirementSchema,
  createPrintLayerSchema,
  createSizeConfigSchema,
  livePricingSchema,
  sizeInputSchema,
  upsertPrintSpecSchema,
  upsertSizeStrategySchema,
  versionIdParamSchema,
} from './print-engine.validation.js';

const vendorRouter = Router();
vendorRouter.use(authenticate);

vendorRouter.get(
  '/versions/:versionId/context',
  validate(versionIdParamSchema, 'params'),
  printJobController.getContext,
);

vendorRouter.post(
  '/versions/:versionId/resolve-size',
  validate(versionIdParamSchema, 'params'),
  validate(sizeInputSchema),
  printJobController.resolveSize,
);

vendorRouter.post(
  '/artwork/presign',
  validate(artworkPresignSchema),
  printJobController.presignArtwork,
);

vendorRouter.post(
  '/artwork/register',
  validate(artworkRegisterSchema),
  printJobController.registerArtwork,
);

vendorRouter.post(
  '/artwork/upload',
  withArtworkUpload(artworkMultipartUpload.single('file')),
  validate(artworkMultipartBodySchema),
  printJobController.uploadArtworkMultipart,
);

vendorRouter.get(
  '/artwork/:artworkVersionId',
  validate(artworkVersionIdParamSchema, 'params'),
  printJobController.getArtworkStatus,
);

vendorRouter.post(
  '/calculate-pricing',
  validate(livePricingSchema),
  printJobController.calculatePricing,
);

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

adminRouter.get(
  '/versions/:versionId',
  validate(versionIdParamSchema, 'params'),
  adminPrintEngineController.getConfig,
);

adminRouter.put(
  '/versions/:versionId/print-specification',
  validate(versionIdParamSchema, 'params'),
  validate(upsertPrintSpecSchema),
  adminPrintEngineController.upsertPrintSpec,
);

adminRouter.put(
  '/versions/:versionId/size-strategy',
  validate(versionIdParamSchema, 'params'),
  validate(upsertSizeStrategySchema),
  adminPrintEngineController.upsertSizeStrategy,
);

adminRouter.post(
  '/size-strategies/:strategyId/sizes',
  validate(createSizeConfigSchema),
  adminPrintEngineController.createSizeConfig,
);

adminRouter.delete('/size-configurations/:id', adminPrintEngineController.deleteSizeConfig);

adminRouter.post(
  '/versions/:versionId/file-requirements',
  validate(versionIdParamSchema, 'params'),
  validate(createFileRequirementSchema),
  adminPrintEngineController.createFileRequirement,
);

adminRouter.delete(
  '/file-requirements/:id',
  validate(z.object({ id: z.string().min(1) }), 'params'),
  adminPrintEngineController.deleteFileRequirement,
);

adminRouter.post(
  '/versions/:versionId/print-layers',
  validate(versionIdParamSchema, 'params'),
  validate(createPrintLayerSchema),
  adminPrintEngineController.createPrintLayer,
);

adminRouter.post(
  '/versions/:versionId/coverage-rules',
  validate(versionIdParamSchema, 'params'),
  validate(createCoverageRuleSchema),
  adminPrintEngineController.createCoverageRule,
);

const productionRouter = Router();
productionRouter.use(authenticate);
productionRouter.use(
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER, RoleName.STAFF),
);

productionRouter.get(
  '/order-items/:orderItemId/artwork',
  productionArtworkController.listOrderArtwork,
);

productionRouter.patch(
  '/order-artwork/:id/approval',
  validate(orderArtworkIdParamSchema, 'params'),
  validate(artworkApprovalSchema),
  productionArtworkController.updateApproval,
);

productionRouter.get(
  '/order-artwork/:id/inspection',
  validate(orderArtworkIdParamSchema, 'params'),
  productionArtworkController.getOrderArtworkInspection,
);

productionRouter.post(
  '/order-artwork/:id/replace',
  validate(orderArtworkIdParamSchema, 'params'),
  withArtworkUpload(artworkMultipartUpload.single('file')),
  productionArtworkController.replaceOrderArtwork,
);

productionRouter.get(
  '/artwork/:artworkVersionId/download',
  validate(artworkVersionIdParamSchema, 'params'),
  productionArtworkController.downloadOriginal,
);

export { vendorRouter as printJobRoutes, adminRouter as adminPrintEngineRoutes, productionRouter as productionArtworkRoutes };

import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import {
  imageMultipartBodySchema,
  presignedUploadSchema,
} from '../../services/storage/storage.validation.js';
import { imageMultipartUpload } from './image-upload.middleware.js';
import { withImageUpload } from './image-upload.wrapper.js';
import { storageController } from './storage.controller.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.post('/upload-url', validate(presignedUploadSchema), storageController.presignUpload);
router.post(
  '/upload',
  withImageUpload(imageMultipartUpload.single('file')),
  validate(imageMultipartBodySchema),
  storageController.uploadImage,
);

export { router as storageRoutes };

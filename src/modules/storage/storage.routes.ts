import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { presignedUploadSchema } from '../../services/storage/storage.validation.js';
import { storageController } from './storage.controller.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.post('/upload-url', validate(presignedUploadSchema), storageController.presignUpload);

export { router as storageRoutes };

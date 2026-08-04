import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { adminOrdersController } from './admin-orders.controller.js';
import { adminCreateOrderSchema, adminOrderPreviewSchema } from './admin-orders.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.post('/preview', validate(adminOrderPreviewSchema), adminOrdersController.preview);
router.post('/', validate(adminCreateOrderSchema), adminOrdersController.create);

export { router as adminOrdersRoutes };

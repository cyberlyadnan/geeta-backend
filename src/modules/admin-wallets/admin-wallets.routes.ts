import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { adminWalletsController } from './admin-wallets.controller.js';
import {
  adminWalletAdjustSchema,
  listAdminWalletsQuerySchema,
  userIdParamSchema,
} from './admin-wallets.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/', validate(listAdminWalletsQuerySchema, 'query'), adminWalletsController.list);
router.post('/credit', validate(adminWalletAdjustSchema), adminWalletsController.credit);
router.post('/debit', validate(adminWalletAdjustSchema), adminWalletsController.debit);
router.get('/:userId', validate(userIdParamSchema, 'params'), adminWalletsController.getByUserId);

export { router as adminWalletsRoutes };

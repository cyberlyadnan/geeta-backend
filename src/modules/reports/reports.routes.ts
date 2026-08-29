import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { reportsController } from './reports.controller.js';
import {
  collectionsQuerySchema,
  expenseSummaryQuerySchema,
  salesRegisterQuerySchema,
} from './reports.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/sales-register', validate(salesRegisterQuerySchema, 'query'), reportsController.salesRegister);
router.get('/collections', validate(collectionsQuerySchema, 'query'), reportsController.collections);
router.get('/expense-summary', validate(expenseSummaryQuerySchema, 'query'), reportsController.expenseSummary);

export { router as reportsRoutes };

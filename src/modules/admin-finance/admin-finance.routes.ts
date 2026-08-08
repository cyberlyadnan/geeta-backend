import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { adminFinanceController } from './admin-finance.controller.js';
import {
  financeSummaryQuerySchema,
  gstExportQuerySchema,
  gstReportQuerySchema,
  ledgerExportQuerySchema,
} from './admin-finance.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/summary', validate(financeSummaryQuerySchema, 'query'), adminFinanceController.summary);
router.get('/gst-report', validate(gstReportQuerySchema, 'query'), adminFinanceController.gstReport);
router.get(
  '/gst-report/export',
  validate(gstExportQuerySchema, 'query'),
  adminFinanceController.gstReportExport,
);
router.get(
  '/ledger/export',
  validate(ledgerExportQuerySchema, 'query'),
  adminFinanceController.ledgerExport,
);

export { router as adminFinanceRoutes };

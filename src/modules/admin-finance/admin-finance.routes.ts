import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { adminFinanceController } from './admin-finance.controller.js';
import { adminFinanceReportsController } from './admin-finance-reports.controller.js';
import {
  ageingQuerySchema,
  balanceSheetQuerySchema,
  exportQuerySchema,
  partyStatementQuerySchema,
  profitLossQuerySchema,
  reportRangeSchema,
  trialBalanceQuerySchema,
} from './admin-finance-reports.validation.js';
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

// ── Financial statements (Phase 5) ───────────────────────────────────────────
// The original three endpoints above stay exactly as they were so existing screens keep working;
// everything the double-entry engine added is mounted alongside them rather than replacing them.
router.get('/dashboard', validate(reportRangeSchema, 'query'), adminFinanceReportsController.dashboard);
router.get('/trial-balance', validate(trialBalanceQuerySchema, 'query'), adminFinanceReportsController.trialBalance);
router.get('/profit-loss', validate(profitLossQuerySchema, 'query'), adminFinanceReportsController.profitLoss);
router.get('/balance-sheet', validate(balanceSheetQuerySchema, 'query'), adminFinanceReportsController.balanceSheet);
router.get('/cash-flow', validate(reportRangeSchema, 'query'), adminFinanceReportsController.cashFlow);
router.get('/ageing', validate(ageingQuerySchema, 'query'), adminFinanceReportsController.ageing);
router.get('/party-statement', validate(partyStatementQuerySchema, 'query'), adminFinanceReportsController.partyStatement);
router.get('/reconciliation', validate(reportRangeSchema, 'query'), adminFinanceReportsController.reconciliation);

// ── GST ──────────────────────────────────────────────────────────────────────
router.get('/gst/gstr1', validate(reportRangeSchema, 'query'), adminFinanceReportsController.gstr1);
router.get('/gst/gstr3b', validate(reportRangeSchema, 'query'), adminFinanceReportsController.gstr3b);
router.get('/gst/purchase-register', validate(reportRangeSchema, 'query'), adminFinanceReportsController.purchaseRegister);

// ── Excel export ─────────────────────────────────────────────────────────────
router.get('/export', validate(exportQuerySchema, 'query'), adminFinanceReportsController.exportWorkbook);

export { router as adminFinanceRoutes };

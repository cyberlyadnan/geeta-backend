import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../validators/validate.js';
import { vendorReportsController } from './vendor-reports.controller.js';
import {
  invoiceIdParamSchema,
  invoiceListQuerySchema,
  purchaseReportQuerySchema,
  summaryQuerySchema,
  vendorExportQuerySchema,
  walletStatementQuerySchema,
} from './vendor-reports.validation.js';

const router = Router();

/**
 * No role gate by design. Every handler reads `req.user.id` and scopes its query to that vendor —
 * an admin hitting these endpoints sees their own (empty) figures, not everyone's. Authorisation
 * by data scope rather than by role is what keeps this safe as new report types are added.
 */
router.use(authenticate);

router.get('/summary', validate(summaryQuerySchema, 'query'), vendorReportsController.summary);
router.get('/purchases', validate(purchaseReportQuerySchema, 'query'), vendorReportsController.purchases);
router.get('/purchases/filters', vendorReportsController.purchaseFilters);
router.get('/invoices', validate(invoiceListQuerySchema, 'query'), vendorReportsController.invoices);
router.get(
  '/invoices/:id/download',
  validate(invoiceIdParamSchema, 'params'),
  vendorReportsController.invoiceDownload,
);
router.get('/wallet', validate(walletStatementQuerySchema, 'query'), vendorReportsController.wallet);
router.get('/export', validate(vendorExportQuerySchema, 'query'), vendorReportsController.exportWorkbook);

export { router as vendorReportsRoutes };

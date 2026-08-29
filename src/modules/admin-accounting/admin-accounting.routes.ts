import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { adminAccountingController } from './admin-accounting.controller.js';
import {
  accountLedgerQuerySchema,
  accountingIdParamSchema,
  chartQuerySchema,
  createAccountSchema,
  dayBookQuerySchema,
  financeSettingsSchema,
  manualJournalSchema,
  periodStatusSchema,
  reverseEntrySchema,
  runProjectionSchema,
  updateAccountSchema,
} from './admin-accounting.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

// Chart of accounts
router.get('/accounts', validate(chartQuerySchema, 'query'), adminAccountingController.chart);
router.post(
  '/accounts',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(createAccountSchema),
  adminAccountingController.createAccount,
);
router.patch(
  '/accounts/:id',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(accountingIdParamSchema, 'params'),
  validate(updateAccountSchema),
  adminAccountingController.updateAccount,
);
router.post('/accounts/reseed', authorize(RoleName.SUPER_ADMIN), adminAccountingController.reseedChart);
router.get(
  '/accounts/:id/ledger',
  validate(accountingIdParamSchema, 'params'),
  validate(accountLedgerQuerySchema, 'query'),
  adminAccountingController.accountLedger,
);

// Day book & journal
router.get('/day-book', validate(dayBookQuerySchema, 'query'), adminAccountingController.dayBook);
router.get('/entries/:id', validate(accountingIdParamSchema, 'params'), adminAccountingController.journalEntry);
router.post(
  '/entries',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(manualJournalSchema),
  adminAccountingController.postManualJournal,
);
router.post(
  '/entries/:id/reverse',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(accountingIdParamSchema, 'params'),
  validate(reverseEntrySchema),
  adminAccountingController.reverseEntry,
);

// Fiscal periods
router.get('/periods', adminAccountingController.fiscalYears);
router.patch(
  '/periods/:id',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(accountingIdParamSchema, 'params'),
  validate(periodStatusSchema),
  adminAccountingController.setPeriodStatus,
);

// Engine settings & sync
router.get('/settings', adminAccountingController.getSettings);
router.patch(
  '/settings',
  authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validate(financeSettingsSchema),
  adminAccountingController.updateSettings,
);
router.post('/sync', validate(runProjectionSchema), adminAccountingController.runProjection);
router.get('/sync/history', adminAccountingController.projectionHistory);

export { router as adminAccountingRoutes };

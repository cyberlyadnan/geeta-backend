import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { cashBankController } from './cash-bank.controller.js';
import {
  bankTransactionListQuerySchema,
  cashBankIdParamSchema,
  createBankTransactionSchema,
  createCashBankAccountSchema,
  reconcileSchema,
  updateCashBankAccountSchema,
} from './cash-bank.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/accounts', cashBankController.listAccounts);
router.post('/accounts', validate(createCashBankAccountSchema), cashBankController.createAccount);
router.patch(
  '/accounts/:id',
  validate(cashBankIdParamSchema, 'params'),
  validate(updateCashBankAccountSchema),
  cashBankController.updateAccount,
);
router.get(
  '/accounts/:id/reconciliations',
  validate(cashBankIdParamSchema, 'params'),
  cashBankController.listReconciliations,
);
router.post(
  '/accounts/:id/reconcile',
  validate(cashBankIdParamSchema, 'params'),
  validate(reconcileSchema),
  cashBankController.reconcile,
);

router.get('/transactions', validate(bankTransactionListQuerySchema, 'query'), cashBankController.listTransactions);
router.post('/transactions', validate(createBankTransactionSchema), cashBankController.createTransaction);

export { router as cashBankRoutes };

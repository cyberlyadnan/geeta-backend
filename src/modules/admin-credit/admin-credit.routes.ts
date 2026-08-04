import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { adminCreditController } from './admin-credit.controller.js';
import {
  creditAccountIdParamSchema,
  listCreditTransactionsQuerySchema,
  listFinancialEventsQuerySchema,
  recordRepaymentSchema,
} from './admin-credit.validation.js';

const creditAccountsRouter = Router();

creditAccountsRouter.use(authenticate);
creditAccountsRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

creditAccountsRouter.post(
  '/:id/repayments',
  validate(creditAccountIdParamSchema, 'params'),
  validate(recordRepaymentSchema),
  adminCreditController.recordRepayment,
);
creditAccountsRouter.get(
  '/:id/transactions',
  validate(creditAccountIdParamSchema, 'params'),
  validate(listCreditTransactionsQuerySchema, 'query'),
  adminCreditController.listTransactions,
);

const financialEventsRouter = Router();

financialEventsRouter.use(authenticate);
financialEventsRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

financialEventsRouter.get(
  '/',
  validate(listFinancialEventsQuerySchema, 'query'),
  adminCreditController.listFinancialEvents,
);

export { creditAccountsRouter as adminCreditAccountsRoutes, financialEventsRouter as adminFinancialEventsRoutes };

import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { walletController } from './wallet.controller.js';
import { addMoneySchema, listTransactionsQuerySchema } from './wallet.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.VENDOR));

router.get('/', walletController.getWallet);
router.get('/summary', walletController.getSummary);
router.get('/transactions', validate(listTransactionsQuerySchema, 'query'), walletController.listTransactions);
router.post('/add-money', validate(addMoneySchema), walletController.addMoney);

export { router as walletRoutes };

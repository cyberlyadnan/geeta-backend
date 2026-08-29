import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { purchasesController } from './purchases.controller.js';
import {
  billListQuerySchema,
  cancelBillSchema,
  createPurchaseBillSchema,
  createSupplierPaymentSchema,
  createSupplierSchema,
  paymentListQuerySchema,
  purchaseIdParamSchema,
  supplierListQuerySchema,
  updateSupplierSchema,
} from './purchases.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/suppliers', validate(supplierListQuerySchema, 'query'), purchasesController.listSuppliers);
router.post('/suppliers', validate(createSupplierSchema), purchasesController.createSupplier);
router.get('/suppliers/:id', validate(purchaseIdParamSchema, 'params'), purchasesController.getSupplier);
router.patch(
  '/suppliers/:id',
  validate(purchaseIdParamSchema, 'params'),
  validate(updateSupplierSchema),
  purchasesController.updateSupplier,
);

router.get('/bills', validate(billListQuerySchema, 'query'), purchasesController.listBills);
router.post('/bills', validate(createPurchaseBillSchema), purchasesController.createBill);
router.get('/bills/:id', validate(purchaseIdParamSchema, 'params'), purchasesController.getBill);
router.post(
  '/bills/:id/cancel',
  validate(purchaseIdParamSchema, 'params'),
  validate(cancelBillSchema),
  purchasesController.cancelBill,
);

router.get('/payments', validate(paymentListQuerySchema, 'query'), purchasesController.listPayments);
router.post('/payments', validate(createSupplierPaymentSchema), purchasesController.createPayment);

export { router as purchasesRoutes };

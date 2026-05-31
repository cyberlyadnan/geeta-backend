import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { paymentsController } from './payments.controller.js';
import { createPaymentSchema, paymentIdParamSchema } from './payments.validation.js';

const router = Router();

router.post(
  '/create',
  authenticate,
  authorize(RoleName.VENDOR),
  validate(createPaymentSchema),
  paymentsController.create,
);

router.get(
  '/:id',
  authenticate,
  authorize(RoleName.VENDOR),
  validate(paymentIdParamSchema, 'params'),
  paymentsController.getById,
);

router.post(
  '/:id/cancel',
  authenticate,
  authorize(RoleName.VENDOR),
  validate(paymentIdParamSchema, 'params'),
  paymentsController.cancel,
);

export { router as paymentsRoutes };

import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { retailCustomerController } from './retail-customer.controller.js';
import { createRetailCustomerSchema, lookupRetailCustomerQuerySchema } from './retail-customer.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.post(
  '/lookup',
  validate(lookupRetailCustomerQuerySchema, 'query'),
  retailCustomerController.lookup,
);
router.post('/', validate(createRetailCustomerSchema), retailCustomerController.create);

export { router as retailCustomerRoutes };

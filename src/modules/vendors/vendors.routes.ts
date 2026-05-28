import { Router } from 'express';
import { vendorsController } from './vendors.controller.js';
import { validate } from '../../validators/validate.js';
import { vendorStatusByPhoneSchema } from './vendors.validation.js';

const router = Router();

router.get(
  '/status/:phone',
  validate(vendorStatusByPhoneSchema, 'params'),
  vendorsController.getStatusByPhone,
);

export { router as vendorsRoutes };

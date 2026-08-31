import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { dispatchController } from './dispatch.controller.js';
import {
  addOrderSchema,
  batchIdParamSchema,
  changeBatchShiftSchema,
  createShiftSchema,
  listBatchesQuerySchema,
  listShiftsQuerySchema,
  setDeliveryChargeSchema,
  shiftIdParamSchema,
  updateShiftSchema,
  removeOrderParamSchema,
  setBatchDeliveryServiceSchema,
} from './dispatch.validation.js';

/** Dispatcher-facing: staff who physically bill and ship batches. */
const dispatchRouter = Router();

dispatchRouter.use(authenticate);
dispatchRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER, RoleName.STAFF));

dispatchRouter.get('/shifts', validate(listShiftsQuerySchema, 'query'), dispatchController.listShifts);
dispatchRouter.get('/batches', validate(listBatchesQuerySchema, 'query'), dispatchController.listBatches);
dispatchRouter.get('/batches/:id', validate(batchIdParamSchema, 'params'), dispatchController.getBatch);
dispatchRouter.post(
  '/batches/:id/delivery-charge',
  validate(batchIdParamSchema, 'params'),
  validate(setDeliveryChargeSchema),
  dispatchController.setDeliveryCharge,
);
dispatchRouter.post(
  '/batches/:id/dispatched',
  validate(batchIdParamSchema, 'params'),
  dispatchController.markDispatched,
);
dispatchRouter.delete(
  '/batches/:id/orders/:orderId',
  validate(removeOrderParamSchema, 'params'),
  dispatchController.removeOrder,
);
dispatchRouter.get(
  '/batches/:id/invoice',
  validate(batchIdParamSchema, 'params'),
  dispatchController.getInvoice,
);
dispatchRouter.post(
  '/batches/:id/orders',
  validate(batchIdParamSchema, 'params'),
  validate(addOrderSchema),
  dispatchController.addOrder,
);
dispatchRouter.patch(
  '/batches/:id/shift',
  validate(batchIdParamSchema, 'params'),
  validate(changeBatchShiftSchema),
  dispatchController.changeBatchShift,
);
dispatchRouter.patch(
  '/batches/:id/delivery-service',
  validate(batchIdParamSchema, 'params'),
  validate(setBatchDeliveryServiceSchema),
  dispatchController.setBatchDeliveryService,
);
dispatchRouter.get(
  '/batches/:id/available-orders',
  validate(batchIdParamSchema, 'params'),
  dispatchController.listAvailableOrders,
);

/** Shift masters are configuration — admin/manager only, not general dispatch staff. */
const adminDispatchRouter = Router();

adminDispatchRouter.use(authenticate);
adminDispatchRouter.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

adminDispatchRouter.post('/shifts', validate(createShiftSchema), dispatchController.createShift);
adminDispatchRouter.patch(
  '/shifts/:id',
  validate(shiftIdParamSchema, 'params'),
  validate(updateShiftSchema),
  dispatchController.updateShift,
);

export { dispatchRouter as dispatchRoutes, adminDispatchRouter as adminDispatchRoutes };

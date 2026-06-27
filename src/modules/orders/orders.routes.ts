import { Router } from 'express';
import { ordersController } from './orders.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../validators/validate.js';
import {
  createProductionOrderSchema,
  draftIdParamSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
  orderPreviewSchema,
  saveDraftSchema,
} from './orders.validation.js';

const router = Router();

router.use(authenticate);

router.post('/preview', validate(orderPreviewSchema), ordersController.preview);

router.get('/drafts', ordersController.listDrafts);
router.post('/drafts', validate(saveDraftSchema), ordersController.saveDraft);
router.delete('/drafts/:draftId', validate(draftIdParamSchema, 'params'), ordersController.deleteDraft);

router.get('/', validate(listOrdersQuerySchema, 'query'), ordersController.list);
router.post('/', validate(createProductionOrderSchema), ordersController.create);
router.post('/:id/reorder', validate(orderIdParamSchema, 'params'), ordersController.reorder);
router.get('/:id', validate(orderIdParamSchema, 'params'), ordersController.getById);

export { router as ordersRoutes };

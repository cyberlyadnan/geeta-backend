import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { adminSlidersController } from './admin-sliders.controller.js';
import {
  bulkSlideStatusSchema,
  createSlideSchema,
  listAdminSlidesQuerySchema,
  reorderSlidesSchema,
  slideIdParamSchema,
  updateSlideSchema,
  updateSlideStatusSchema,
} from './slider.validation.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/', validate(listAdminSlidesQuerySchema, 'query'), adminSlidersController.list);
router.post('/', validate(createSlideSchema), adminSlidersController.create);
router.patch('/reorder', validate(reorderSlidesSchema), adminSlidersController.reorder);
router.patch('/status', validate(bulkSlideStatusSchema), adminSlidersController.bulkStatus);

router.get('/:id', validate(slideIdParamSchema, 'params'), adminSlidersController.getById);
router.patch(
  '/:id/status',
  validate(slideIdParamSchema, 'params'),
  validate(updateSlideStatusSchema),
  adminSlidersController.updateStatus,
);
router.post('/:id/duplicate', validate(slideIdParamSchema, 'params'), adminSlidersController.duplicate);
router.patch(
  '/:id',
  validate(slideIdParamSchema, 'params'),
  validate(updateSlideSchema),
  adminSlidersController.update,
);
router.delete('/:id', validate(slideIdParamSchema, 'params'), adminSlidersController.delete);

export { router as adminSlidersRoutes };

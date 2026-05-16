import { Router } from 'express';
import { supportController } from './support.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', supportController.list);
router.get('/:id', supportController.getById);

export { router as supportRoutes };

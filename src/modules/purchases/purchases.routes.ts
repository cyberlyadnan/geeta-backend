import { Router } from 'express';
import { purchasesController } from './purchases.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', purchasesController.list);
router.get('/:id', purchasesController.getById);

export { router as purchasesRoutes };

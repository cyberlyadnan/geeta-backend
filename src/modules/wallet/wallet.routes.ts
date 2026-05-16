import { Router } from 'express';
import { walletController } from './wallet.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', walletController.list);
router.get('/:id', walletController.getById);

export { router as walletRoutes };

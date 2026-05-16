import { Router } from 'express';
import { workflowController } from './workflow.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', workflowController.list);
router.get('/:id', workflowController.getById);

export { router as workflowRoutes };

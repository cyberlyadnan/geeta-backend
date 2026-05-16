import { Router } from 'express';
import { expensesController } from './expenses.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', expensesController.list);
router.get('/:id', expensesController.getById);

export { router as expensesRoutes };

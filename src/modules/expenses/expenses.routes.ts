import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { expensesController } from './expenses.controller.js';
import {
  createExpenseCategorySchema,
  createExpenseSchema,
  expenseCategoryListQuerySchema,
  expenseIdParamSchema,
  expenseListQuerySchema,
  expenseStatusSchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
} from './expenses.validation.js';

const router = Router();

router.use(authenticate);
// Spending is a management concern — production staff never see these routes.
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));

router.get('/categories', validate(expenseCategoryListQuerySchema, 'query'), expensesController.listCategories);
router.post('/categories', validate(createExpenseCategorySchema), expensesController.createCategory);
router.patch(
  '/categories/:id',
  validate(expenseIdParamSchema, 'params'),
  validate(updateExpenseCategorySchema),
  expensesController.updateCategory,
);

router.get('/', validate(expenseListQuerySchema, 'query'), expensesController.list);
router.post('/', validate(createExpenseSchema), expensesController.create);
router.get('/:id', validate(expenseIdParamSchema, 'params'), expensesController.getById);
router.patch('/:id', validate(expenseIdParamSchema, 'params'), validate(updateExpenseSchema), expensesController.update);
router.patch(
  '/:id/status',
  validate(expenseIdParamSchema, 'params'),
  validate(expenseStatusSchema),
  expensesController.setStatus,
);

export { router as expensesRoutes };

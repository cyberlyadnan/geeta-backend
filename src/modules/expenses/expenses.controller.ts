import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { expensesService } from './expenses.service.js';
import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  ExpenseListQuery,
  ExpenseStatusInput,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
} from './expenses.validation.js';

export class ExpensesController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await expensesService.list(req.validatedQuery as ExpenseListQuery);
    return ApiResponse.success(res, result, 'Expenses', 200, result.meta);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await expensesService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const result = await expensesService.create(req.body as CreateExpenseInput, req.user!.id);
    return ApiResponse.created(res, result, 'Expense recorded');
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const result = await expensesService.update(
      req.params['id'] as string,
      req.body as UpdateExpenseInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Expense updated');
  });

  setStatus = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as ExpenseStatusInput;
    const result = await expensesService.setStatus(
      req.params['id'] as string,
      body.status,
      req.user!.id,
      body.notes,
    );
    return ApiResponse.success(res, result, 'Expense status updated');
  });

  listCategories = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as { includeInactive: boolean };
    return ApiResponse.success(res, await expensesService.listCategories(query.includeInactive));
  });

  createCategory = asyncHandler(async (req: Request, res: Response) => {
    const result = await expensesService.createCategory(req.body as CreateExpenseCategoryInput);
    return ApiResponse.created(res, result, 'Expense category created');
  });

  updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const result = await expensesService.updateCategory(
      req.params['id'] as string,
      req.body as UpdateExpenseCategoryInput,
    );
    return ApiResponse.success(res, result, 'Expense category updated');
  });
}

export const expensesController = new ExpensesController();

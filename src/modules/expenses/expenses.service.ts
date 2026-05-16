import { ApiError } from '../../common/errors/ApiError.js';

export class ExpensesService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement expenses business logic
    return [];
  }

  async findById(_id: string): Promise<unknown> {
    // TODO: Implement expenses findById
    throw ApiError.notFound('Expenses resource not found');
  }
}

export const expensesService = new ExpensesService();

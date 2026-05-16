import { ApiError } from '../../common/errors/ApiError.js';

export class ReportsService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement reports business logic
    return [];
  }

  async findById(id: string): Promise<unknown> {
    // TODO: Implement reports findById
    throw ApiError.notFound('Reports resource not found');
  }
}

export const reportsService = new ReportsService();

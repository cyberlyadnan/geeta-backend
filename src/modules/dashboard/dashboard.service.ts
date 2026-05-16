import { ApiError } from '../../common/errors/ApiError.js';

export class DashboardService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement dashboard business logic
    return [];
  }

  async findById(_id: string): Promise<unknown> {
    // TODO: Implement dashboard findById
    throw ApiError.notFound('Dashboard resource not found');
  }
}

export const dashboardService = new DashboardService();

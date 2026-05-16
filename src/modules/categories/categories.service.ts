import { ApiError } from '../../common/errors/ApiError.js';

export class CategoriesService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement categories business logic
    return [];
  }

  async findById(_id: string): Promise<unknown> {
    // TODO: Implement categories findById
    throw ApiError.notFound('Categories resource not found');
  }
}

export const categoriesService = new CategoriesService();

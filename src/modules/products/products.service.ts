import { ApiError } from '../../common/errors/ApiError.js';

export class ProductsService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement products business logic
    return [];
  }

  async findById(_id: string): Promise<unknown> {
    // TODO: Implement products findById
    throw ApiError.notFound('Products resource not found');
  }
}

export const productsService = new ProductsService();

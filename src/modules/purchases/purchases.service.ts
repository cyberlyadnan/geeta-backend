import { ApiError } from '../../common/errors/ApiError.js';

export class PurchasesService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement purchases business logic
    return [];
  }

  async findById(_id: string): Promise<unknown> {
    // TODO: Implement purchases findById
    throw ApiError.notFound('Purchases resource not found');
  }
}

export const purchasesService = new PurchasesService();

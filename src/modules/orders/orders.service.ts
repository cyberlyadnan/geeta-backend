import { ApiError } from '../../common/errors/ApiError.js';

export class OrdersService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement orders business logic
    return [];
  }

  async findById(_id: string): Promise<unknown> {
    // TODO: Implement orders findById
    throw ApiError.notFound('Orders resource not found');
  }
}

export const ordersService = new OrdersService();

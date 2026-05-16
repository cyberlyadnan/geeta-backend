import { ApiError } from '../../common/errors/ApiError.js';

export class PaymentsService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement payments business logic
    return [];
  }

  async findById(_id: string): Promise<unknown> {
    // TODO: Implement payments findById
    throw ApiError.notFound('Payments resource not found');
  }
}

export const paymentsService = new PaymentsService();

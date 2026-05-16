import { ApiError } from '../../common/errors/ApiError.js';

export class SupportService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement support business logic
    return [];
  }

  async findById(_id: string): Promise<unknown> {
    // TODO: Implement support findById
    throw ApiError.notFound('Support resource not found');
  }
}

export const supportService = new SupportService();

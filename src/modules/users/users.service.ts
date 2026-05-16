import { ApiError } from '../../common/errors/ApiError.js';

export class UsersService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement users business logic
    return [];
  }

  async findById(id: string): Promise<unknown> {
    // TODO: Implement users findById
    throw ApiError.notFound('Users resource not found');
  }
}

export const usersService = new UsersService();

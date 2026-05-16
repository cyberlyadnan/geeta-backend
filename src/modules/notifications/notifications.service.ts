import { ApiError } from '../../common/errors/ApiError.js';

export class NotificationsService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement notifications business logic
    return [];
  }

  async findById(_id: string): Promise<unknown> {
    // TODO: Implement notifications findById
    throw ApiError.notFound('Notifications resource not found');
  }
}

export const notificationsService = new NotificationsService();

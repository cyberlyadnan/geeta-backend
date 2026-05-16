import { ApiError } from '../../common/errors/ApiError.js';

export class SettingsService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement settings business logic
    return [];
  }

  async findById(id: string): Promise<unknown> {
    // TODO: Implement settings findById
    throw ApiError.notFound('Settings resource not found');
  }
}

export const settingsService = new SettingsService();

import { ApiError } from '../../common/errors/ApiError.js';

export class WalletService {
  async findAll(): Promise<unknown[]> {
    // TODO: Implement wallet business logic
    return [];
  }

  async findById(_id: string): Promise<unknown> {
    // TODO: Implement wallet findById
    throw ApiError.notFound('Wallet resource not found');
  }
}

export const walletService = new WalletService();

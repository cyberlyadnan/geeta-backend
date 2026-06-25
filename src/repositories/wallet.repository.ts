import { prisma } from '../config/database.js';
import { loadOncePerRequest } from '../common/cache/request-cache-accessor.js';

export class WalletRepository {
  findByUserId(userId: string) {
    return loadOncePerRequest(`wallet:user:${userId}`, () =>
      prisma.wallet.findUnique({ where: { userId } }),
    );
  }

  async ensureByUserId(userId: string) {
    return loadOncePerRequest(`wallet:ensure:${userId}`, async () => {
      const existing = await prisma.wallet.findUnique({ where: { userId } });
      if (existing) return existing;
      return prisma.wallet.create({
        data: {
          userId,
          currentBalance: 0,
          totalAdded: 0,
          totalSpent: 0,
          totalRefunds: 0,
        },
      });
    });
  }
}

export const walletRepository = new WalletRepository();

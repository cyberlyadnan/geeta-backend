import { prisma } from '../config/database.js';
import { USER_LOGIN_SELECT, USER_SESSION_SELECT } from '../common/security/user.serialization.js';
import { loadOncePerRequest } from '../common/cache/request-cache-accessor.js';

export class UserRepository {
  findForLogin(where: { email: string; deletedAt: null } | { phone: string; deletedAt: null }) {
    const key = 'email' in where ? `user:login:email:${where.email}` : `user:login:phone:${where.phone}`;
    return loadOncePerRequest(key, () =>
      prisma.user.findFirst({ where, select: USER_LOGIN_SELECT }),
    );
  }

  findSessionById(userId: string) {
    return loadOncePerRequest(`user:session:${userId}`, () =>
      prisma.user.findUnique({
        where: { id: userId, deletedAt: null },
        select: USER_SESSION_SELECT,
      }),
    );
  }
}

export const userRepository = new UserRepository();

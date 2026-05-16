import type { RoleName } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: RoleName;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};

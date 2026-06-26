import type { RoleName } from '@prisma/client';
import type { ActiveRequestContext } from '../observability/request-context.js';
import type { AuthenticatedUserContext } from '../repositories/context.repository.js';

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
      authContext?: AuthenticatedUserContext;
      validatedQuery?: unknown;
      validatedParams?: unknown;
      performanceContext?: ActiveRequestContext;
    }
  }
}

export {};

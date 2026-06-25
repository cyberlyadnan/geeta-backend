import type { RoleName } from '@prisma/client';
import type { ActiveRequestContext } from '../observability/request-context.js';

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
      validatedQuery?: unknown;
      validatedParams?: unknown;
      performanceContext?: ActiveRequestContext;
    }
  }
}

export {};

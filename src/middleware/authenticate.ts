import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../common/errors/ApiError.js';
import {
  beginAuthentication,
  endAuthentication,
  setRequestUserId,
} from '../observability/request-context.js';
import { tokenService } from '../services/auth/token.service.js';

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  beginAuthentication(req);
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Access token required');
    }

    const token = authHeader.slice(7);
    const payload = tokenService.verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role as import('@prisma/client').RoleName,
      permissions: payload.permissions ?? [],
    };

    setRequestUserId(payload.sub, req);
    endAuthentication(req, 'JWT verification');

    next();
  } catch (error) {
    endAuthentication(req, 'JWT verification (failed)');
    next(error instanceof ApiError ? error : ApiError.unauthorized('Invalid or expired token'));
  }
}

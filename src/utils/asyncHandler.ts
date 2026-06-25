import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { runWithRequestFromReq } from '../observability/request-context.js';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void | Response>;

/**
 * Wraps async route handlers to forward errors to Express error middleware
 * while preserving AsyncLocalStorage request context for Prisma/query timing.
 */
export const asyncHandler =
  (fn: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    void runWithRequestFromReq(req, () => Promise.resolve(fn(req, res, next))).catch(next);
  };

import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';
import { ApiError } from '../common/errors/ApiError.js';

type RequestTarget = 'body' | 'query' | 'params';

function formatZodErrors(error: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    errors[path] = errors[path] ?? [];
    errors[path].push(issue.message);
  }
  return errors;
}

export function validate<T>(schema: ZodSchema<T>, target: RequestTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      next(ApiError.badRequest('Validation failed', formatZodErrors(result.error)));
      return;
    }

    req[target] = result.data as (typeof req)[typeof target];
    next();
  };
}

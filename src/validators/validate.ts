import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';
import { ApiError } from '../common/errors/ApiError.js';
import { beginValidation, endValidation } from '../observability/request-context.js';

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

/**
 * Express 5: `req.query` and `req.params` are read-only — store parsed values on
 * `req.validatedQuery` / `req.validatedParams` instead of reassigning.
 */
export function validate<T>(schema: ZodSchema<T>, target: RequestTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    beginValidation(req);
    try {
      const result = schema.safeParse(req[target]);

      if (!result.success) {
        next(ApiError.badRequest('Validation failed', formatZodErrors(result.error)));
        return;
      }

      switch (target) {
        case 'body':
          req.body = result.data;
          break;
        case 'query':
          req.validatedQuery = result.data;
          break;
        case 'params':
          req.validatedParams = result.data;
          break;
      }

      next();
    } finally {
      endValidation(req);
    }
  };
}

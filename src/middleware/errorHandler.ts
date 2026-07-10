import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { ZodError } from 'zod';
import multer from 'multer';
import { ApiError } from '../common/errors/ApiError.js';
import { env } from '../config/env.js';
import { MAX_ARTWORK_UPLOAD_BYTES } from '../services/storage/storage.types.js';
import { errorTracker } from '../observability/error-tracker.service.js';
import { logger } from '../logs/logger.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    errorTracker.track({
      category: 'api',
      message: err.message,
      statusCode: err.statusCode,
      path: req.originalUrl,
      method: req.method,
      userId: req.user?.id,
    });

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code && { code: err.code }),
      ...(err.details && { details: err.details }),
      ...(err.errors && { errors: err.errors }),
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Artwork file is too large (max ${Math.round(MAX_ARTWORK_UPLOAD_BYTES / (1024 * 1024))} MB).`
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Unexpected file field in upload request'
          : `Upload failed: ${err.message}`;

    res
      .status(err.code === 'LIMIT_FILE_SIZE' ? StatusCodes.REQUEST_TOO_LONG : StatusCodes.BAD_REQUEST)
      .json({
        success: false,
        message,
      });
    return;
  }

  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.') || 'root';
      errors[path] = errors[path] ?? [];
      errors[path].push(issue.message);
    }

    errorTracker.track({
      category: 'validation',
      message: 'Validation failed',
      statusCode: StatusCodes.BAD_REQUEST,
      path: req.originalUrl,
      method: req.method,
      userId: req.user?.id,
    });

    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    errorTracker.track({
      category: 'database',
      message: err.message,
      statusCode:
        err.code === 'P2002'
          ? StatusCodes.CONFLICT
          : err.code === 'P2025'
            ? StatusCodes.NOT_FOUND
            : StatusCodes.INTERNAL_SERVER_ERROR,
      path: req.originalUrl,
      method: req.method,
      userId: req.user?.id,
      stack: err.stack,
    });

    if (err.code === 'P2002') {
      res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: 'A record with this value already exists',
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Record not found',
      });
      return;
    }
  }

  errorTracker.track({
    category: 'unhandled',
    message: err.message,
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    stack: err.stack,
  });

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
  });

  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: 'Route not found',
  });
}

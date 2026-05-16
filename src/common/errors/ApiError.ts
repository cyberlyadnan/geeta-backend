import { StatusCodes } from 'http-status-codes';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: Record<string, string[]>;

  constructor(
    statusCode: number,
    message: string,
    isOperational = true,
    errors?: Record<string, string[]>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;
    Object.setPrototypeOf(this, ApiError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors?: Record<string, string[]>): ApiError {
    return new ApiError(StatusCodes.BAD_REQUEST, message, true, errors);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(StatusCodes.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(StatusCodes.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(StatusCodes.NOT_FOUND, message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(StatusCodes.CONFLICT, message);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, message, false);
  }
}

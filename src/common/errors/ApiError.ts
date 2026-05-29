import { StatusCodes } from 'http-status-codes';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;
  public readonly errors?: Record<string, string[]>;
  public readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    message: string,
    isOperational = true,
    errors?: Record<string, string[]>,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.errors = errors;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors?: Record<string, string[]>): ApiError {
    return new ApiError(StatusCodes.BAD_REQUEST, message, true, errors);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(StatusCodes.UNAUTHORIZED, message);
  }

  static forbidden(
    message = 'Forbidden',
    code?: string,
    details?: Record<string, unknown>,
  ): ApiError {
    return new ApiError(StatusCodes.FORBIDDEN, message, true, undefined, code, details);
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

  static serviceUnavailable(
    message: string,
    code?: string,
    details?: Record<string, unknown>,
  ): ApiError {
    return new ApiError(StatusCodes.SERVICE_UNAVAILABLE, message, true, undefined, code, details);
  }
}

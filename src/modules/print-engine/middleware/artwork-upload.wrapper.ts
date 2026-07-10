import type { RequestHandler } from 'express';
import type { Request, Response, NextFunction } from 'express';

/**
 * Wraps multer middleware so LIMIT_FILE_SIZE and other errors reach the global error handler
 * (with CORS headers already applied by cors middleware).
 */
export function withArtworkUpload(
  uploadMiddleware: RequestHandler,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    uploadMiddleware(req, res, (err: unknown) => {
      if (err) {
        next(err);
        return;
      }
      next();
    });
  };
}

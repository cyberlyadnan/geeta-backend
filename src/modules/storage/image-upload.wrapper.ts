import type { RequestHandler } from 'express';
import type { Request, Response, NextFunction } from 'express';

/** Wraps multer so file-size and other upload errors reach the global error handler. */
export function withImageUpload(uploadMiddleware: RequestHandler): RequestHandler {
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

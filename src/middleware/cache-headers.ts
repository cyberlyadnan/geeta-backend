import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';

/** Attach public cache headers for read-only GET responses */
export function publicCacheHeaders(maxAgeSeconds: number) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}, stale-while-revalidate=60`);
    next();
  };
}

/** ETag support — returns 304 when If-None-Match matches serialized body */
export function withEtag(
  handler: (req: Request, res: Response) => Promise<unknown> | unknown,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = await handler(req, res);
      if (body === undefined || res.headersSent) return;

      const json = JSON.stringify(body);
      const etag = `"${createHash('sha1').update(json).digest('hex')}"`;
      res.setHeader('ETag', etag);

      const clientEtag = req.headers['if-none-match'];
      if (clientEtag === etag) {
        res.status(304).end();
        return;
      }

      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}

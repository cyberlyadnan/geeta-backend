import type { Request, Response, NextFunction } from 'express';
import { RoleName } from '@prisma/client';
import { contextRepository } from '../repositories/context.repository.js';
import { deliverySettingsRepository } from '../repositories/delivery-settings.repository.js';
import {
  recordOperation,
  setRequestVendorProfileId,
} from '../observability/request-context.js';

/**
 * Preloads authenticated session data into the per-request cache.
 * Must run after `authenticate` — safe to call multiple times (deduped).
 */
export async function preloadRequestContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    next();
    return;
  }

  const start = performance.now();
  try {
    req.authContext = await contextRepository.getAuthenticatedUserContext(
      req.user.id,
      req.user.role,
      req,
    );

    if (req.user.role === RoleName.VENDOR && req.authContext.vendorProfile) {
      setRequestVendorProfileId(req.authContext.vendorProfile.id, req);
    }

    if (
      req.user.role === RoleName.VENDOR ||
      req.user.role === RoleName.SUPER_ADMIN ||
      req.user.role === RoleName.ADMIN ||
      req.user.role === RoleName.MANAGER
    ) {
      void deliverySettingsRepository.getOrCreate().catch(() => undefined);
    }
  } catch {
    // Handlers fall back to repository loads
  } finally {
    recordOperation('Preload request context', performance.now() - start, 'auth', req);
  }

  next();
}

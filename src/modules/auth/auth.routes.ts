/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate user
 *     security: []
 */
import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../validators/validate.js';
import { authRateLimiter } from '../../middleware/security.js';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  vendorRegisterSchema,
} from './auth.validation.js';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/register/vendor', authRateLimiter, validate(vendorRegisterSchema), authController.registerVendor);
// Sign-in has its own limiter so ordinary API traffic can never lock the front door — see
// authRateLimiter. Only failed attempts count against it.
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/logout', validate(refreshTokenSchema), authController.logout);
router.get('/me', authenticate, authController.me);
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword,
);

export { router as authRoutes };

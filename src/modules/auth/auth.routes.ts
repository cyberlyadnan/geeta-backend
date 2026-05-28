import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../validators/validate.js';
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  vendorRegisterSchema,
} from './auth.validation.js';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/register/vendor', validate(vendorRegisterSchema), authController.registerVendor);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/logout', validate(refreshTokenSchema), authController.logout);
router.get('/me', authenticate, authController.me);

export { router as authRoutes };

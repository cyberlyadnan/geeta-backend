import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../validators/validate.js';
import { companyProfileController } from './company-profile.controller.js';
import { updateCompanyProfileSchema } from './company-profile.validation.js';

const router = Router();
router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER));
router.get('/', companyProfileController.get);
router.patch('/', validate(updateCompanyProfileSchema), companyProfileController.update);

export { router as companyProfileRoutes };

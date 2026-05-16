import { Router } from 'express';
import { usersController } from './users.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', usersController.list);
router.get('/:id', usersController.getById);

export { router as usersRoutes };

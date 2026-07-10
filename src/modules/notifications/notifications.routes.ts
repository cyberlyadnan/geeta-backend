import { Router } from 'express';
import { notificationsController } from './notifications.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);
router.get('/', notificationsController.list);
router.get('/unread-count', notificationsController.unreadCount);
router.post('/read-all', notificationsController.markAllRead);
router.post('/:id/read', notificationsController.markRead);
router.get('/:id', notificationsController.getById);

export { router as notificationsRoutes };

import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { adminMonitoringController } from './admin-monitoring.controller.js';

const router = Router();

router.use(authenticate);
router.use(authorize(RoleName.SUPER_ADMIN, RoleName.ADMIN));

router.get('/dashboard', adminMonitoringController.dashboard);
router.get('/endpoints', adminMonitoringController.endpoints);
router.get('/slow-requests', adminMonitoringController.slowRequests);
router.get('/errors', adminMonitoringController.errors);
router.get('/database', adminMonitoringController.database);
router.get('/requests', adminMonitoringController.recentRequests);
router.get('/timeline/:requestId', adminMonitoringController.timeline);

export { router as adminMonitoringRoutes };

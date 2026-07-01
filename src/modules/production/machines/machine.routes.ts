import { Router } from 'express';
import { RoleName } from '@prisma/client';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorize } from '../../../middleware/authorize.js';
import { validate } from '../../../validators/validate.js';
import { machineController } from './machine.controller.js';
import {
  addMaintenanceSchema,
  changeMachineStatusSchema,
  createMachineSchema,
  listMachinesQuerySchema,
  machineIdParamSchema,
  updateMachineSchema,
} from './machine.validation.js';

const router = Router();
router.use(authenticate);

const viewRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.STAFF,
] as const;
const manageRoles = [RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER] as const;

router.get('/machines/overview', authorize(...viewRoles), machineController.overview);

router.get(
  '/machines',
  authorize(...viewRoles),
  validate(listMachinesQuerySchema, 'query'),
  machineController.list,
);

router.get(
  '/machines/:machineId',
  authorize(...viewRoles),
  validate(machineIdParamSchema, 'params'),
  machineController.getById,
);

router.get(
  '/machines/:machineId/history',
  authorize(...viewRoles),
  validate(machineIdParamSchema, 'params'),
  machineController.history,
);

router.post(
  '/machines',
  authorize(...manageRoles),
  validate(createMachineSchema),
  machineController.create,
);

router.patch(
  '/machines/:machineId',
  authorize(...manageRoles),
  validate(machineIdParamSchema, 'params'),
  validate(updateMachineSchema),
  machineController.update,
);

router.post(
  '/machines/:machineId/archive',
  authorize(...manageRoles),
  validate(machineIdParamSchema, 'params'),
  machineController.archive,
);

router.post(
  '/machines/:machineId/restore',
  authorize(...manageRoles),
  validate(machineIdParamSchema, 'params'),
  machineController.restore,
);

router.patch(
  '/machines/:machineId/status',
  authorize(...manageRoles),
  validate(machineIdParamSchema, 'params'),
  validate(changeMachineStatusSchema),
  machineController.changeStatus,
);

router.post(
  '/machines/:machineId/maintenance',
  authorize(...manageRoles),
  validate(machineIdParamSchema, 'params'),
  validate(addMaintenanceSchema),
  machineController.addMaintenance,
);

export { router as machineRoutes };

import {
  ActivityAction,
  MachineOperationalStatus,
  MachineStatus,
  type Prisma,
  type RoleName,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ApiError } from '../../../common/errors/ApiError.js';
import { eventBus, APP_EVENTS } from '../../../events/eventBus.js';
import { activityLogService } from '../../../services/activity/activity-log.service.js';
import { controlCenterCache } from '../control-center/control-center.cache.js';
import { assertCanManageMachines, assertCanViewMachines } from './machine.access.js';
import { machineCache } from './machine.cache.js';
import { mapMachineListItem, mapMachineToDto } from './machine.dto.js';
import { machineRepository } from './machine.repository.js';
import type {
  AddMaintenanceBody,
  ChangeMachineStatusBody,
  CreateMachineBody,
  ListMachinesQuery,
  UpdateMachineBody,
} from './machine.validation.js';

type StatusChangeInput = {
  machineId: string;
  toStatus: MachineOperationalStatus;
  reason?: string;
  actorId?: string;
  workflowTaskId?: string;
  assignmentId?: string;
  tx?: Prisma.TransactionClient;
};

export class MachineService {
  async list(query: ListMachinesQuery, role: RoleName, permissions: string[]) {
    assertCanViewMachines(role, permissions);
    const result = await machineRepository.listCached(query);
    return {
      items: result.items.map(mapMachineListItem),
      meta: { nextCursor: result.nextCursor, hasMore: result.hasMore, limit: result.limit },
    };
  }

  async getById(machineId: string, role: RoleName, permissions: string[]) {
    assertCanViewMachines(role, permissions);
    const machine = await machineRepository.findById(machineId);
    if (!machine) throw ApiError.notFound('Machine not found');
    return mapMachineToDto(machine);
  }

  async create(body: CreateMachineBody, actorId: string, role: RoleName, permissions: string[]) {
    assertCanManageMachines(role, permissions);

    const existing = await machineRepository.findByCode(body.machineCode);
    if (existing) throw ApiError.conflict('Machine code already exists');

    const department = await prisma.department.findUnique({
      where: { id: body.departmentId },
      select: { facilityId: true },
    });
    if (!department) throw ApiError.badRequest('Department not found');
    const facilityId = body.facilityId ?? department.facilityId;

    const machine = await prisma.$transaction(async (tx) => {
      const created = await tx.machine.create({
        data: {
          facilityId,
          departmentId: body.departmentId,
          machineCode: body.machineCode.toUpperCase(),
          machineName: body.machineName,
          machineType: body.machineType,
          manufacturer: body.manufacturer,
          model: body.model,
          capabilities: body.capabilities,
          supportedProcesses: body.supportedProcesses,
          minSheetWidthMm: body.minSheetWidthMm,
          minSheetHeightMm: body.minSheetHeightMm,
          maxSheetWidthMm: body.maxSheetWidthMm,
          maxSheetHeightMm: body.maxSheetHeightMm,
          maxPrintWidthMm: body.maxPrintWidthMm,
          maxPrintHeightMm: body.maxPrintHeightMm,
          speedRating: body.speedRating,
          capacityPerHour: body.capacityPerHour,
          workingHours: (body.workingHours ?? {}) as Prisma.InputJsonValue,
          averageRuntimeMinutes: body.averageRuntimeMinutes,
          supportedProductIds: body.supportedProductIds,
          operationalStatus: body.operationalStatus,
          notes: body.notes,
          metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
          status: MachineStatus.ACTIVE,
        },
        select: { id: true },
      });

      await tx.machineStatusHistory.create({
        data: {
          machineId: created.id,
          toStatus: body.operationalStatus,
          reason: 'Machine created',
          changedById: actorId,
        },
      });

      return created;
    });

    this.afterMutation(ActivityAction.MACHINE_CREATED, APP_EVENTS.MACHINE_CREATED, {
      machineId: machine.id,
      actorId,
    });

    const record = await machineRepository.findById(machine.id);
    if (!record) throw ApiError.internal('Failed to load machine');
    return mapMachineToDto(record);
  }

  async update(
    machineId: string,
    body: UpdateMachineBody,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    assertCanManageMachines(role, permissions);
    const existing = await machineRepository.findById(machineId);
    if (!existing) throw ApiError.notFound('Machine not found');

    await prisma.machine.update({
      where: { id: machineId },
      data: {
        ...(body.departmentId !== undefined ? { departmentId: body.departmentId } : {}),
        ...(body.machineName !== undefined ? { machineName: body.machineName } : {}),
        ...(body.machineType !== undefined ? { machineType: body.machineType } : {}),
        ...(body.manufacturer !== undefined ? { manufacturer: body.manufacturer } : {}),
        ...(body.model !== undefined ? { model: body.model } : {}),
        ...(body.capabilities !== undefined ? { capabilities: body.capabilities } : {}),
        ...(body.supportedProcesses !== undefined
          ? { supportedProcesses: body.supportedProcesses }
          : {}),
        ...(body.minSheetWidthMm !== undefined ? { minSheetWidthMm: body.minSheetWidthMm } : {}),
        ...(body.minSheetHeightMm !== undefined ? { minSheetHeightMm: body.minSheetHeightMm } : {}),
        ...(body.maxSheetWidthMm !== undefined ? { maxSheetWidthMm: body.maxSheetWidthMm } : {}),
        ...(body.maxSheetHeightMm !== undefined ? { maxSheetHeightMm: body.maxSheetHeightMm } : {}),
        ...(body.maxPrintWidthMm !== undefined ? { maxPrintWidthMm: body.maxPrintWidthMm } : {}),
        ...(body.maxPrintHeightMm !== undefined ? { maxPrintHeightMm: body.maxPrintHeightMm } : {}),
        ...(body.speedRating !== undefined ? { speedRating: body.speedRating } : {}),
        ...(body.capacityPerHour !== undefined ? { capacityPerHour: body.capacityPerHour } : {}),
        ...(body.workingHours !== undefined
          ? { workingHours: body.workingHours as Prisma.InputJsonValue }
          : {}),
        ...(body.averageRuntimeMinutes !== undefined
          ? { averageRuntimeMinutes: body.averageRuntimeMinutes }
          : {}),
        ...(body.supportedProductIds !== undefined
          ? { supportedProductIds: body.supportedProductIds }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.metadata !== undefined ? { metadata: body.metadata as Prisma.InputJsonValue } : {}),
      },
    });

    this.afterMutation(ActivityAction.MACHINE_UPDATED, APP_EVENTS.MACHINE_UPDATED, {
      machineId,
      actorId,
    });

    const record = await machineRepository.findById(machineId);
    if (!record) throw ApiError.notFound('Machine not found');
    return mapMachineToDto(record);
  }

  async archive(machineId: string, actorId: string, role: RoleName, permissions: string[]) {
    assertCanManageMachines(role, permissions);
    const existing = await machineRepository.findById(machineId);
    if (!existing) throw ApiError.notFound('Machine not found');

    await prisma.machine.update({
      where: { id: machineId },
      data: { isActive: false, status: MachineStatus.DECOMMISSIONED },
    });

    await this.changeOperationalStatus({
      machineId,
      toStatus: MachineOperationalStatus.OFFLINE,
      reason: 'Machine archived',
      actorId,
    });

    this.afterMutation(ActivityAction.MACHINE_ARCHIVED, APP_EVENTS.MACHINE_ARCHIVED, {
      machineId,
      actorId,
    });

    const record = await machineRepository.findById(machineId);
    if (!record) throw ApiError.notFound('Machine not found');
    return mapMachineToDto(record);
  }

  async restore(machineId: string, actorId: string, role: RoleName, permissions: string[]) {
    assertCanManageMachines(role, permissions);
    const existing = await machineRepository.findById(machineId);
    if (!existing) throw ApiError.notFound('Machine not found');

    await prisma.machine.update({
      where: { id: machineId },
      data: { isActive: true, status: MachineStatus.ACTIVE },
    });

    await this.changeOperationalStatus({
      machineId,
      toStatus: MachineOperationalStatus.AVAILABLE,
      reason: 'Machine restored',
      actorId,
    });

    this.afterMutation(ActivityAction.MACHINE_UPDATED, APP_EVENTS.MACHINE_UPDATED, {
      machineId,
      actorId,
    });

    const record = await machineRepository.findById(machineId);
    if (!record) throw ApiError.notFound('Machine not found');
    return mapMachineToDto(record);
  }

  async changeStatus(
    machineId: string,
    body: ChangeMachineStatusBody,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    assertCanManageMachines(role, permissions);
    const existing = await machineRepository.findById(machineId);
    if (!existing) throw ApiError.notFound('Machine not found');

    await this.changeOperationalStatus({
      machineId,
      toStatus: body.operationalStatus,
      reason: body.reason,
      actorId,
    });

    this.afterMutation(ActivityAction.MACHINE_STATUS_CHANGED, APP_EVENTS.MACHINE_STATUS_CHANGED, {
      machineId,
      actorId,
      operationalStatus: body.operationalStatus,
    });

    const record = await machineRepository.findById(machineId);
    if (!record) throw ApiError.notFound('Machine not found');
    return mapMachineToDto(record);
  }

  async addMaintenance(
    machineId: string,
    body: AddMaintenanceBody,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    assertCanManageMachines(role, permissions);
    const existing = await machineRepository.findById(machineId);
    if (!existing) throw ApiError.notFound('Machine not found');

    await prisma.$transaction(async (tx) => {
      await tx.machineMaintenanceRecord.create({
        data: {
          machineId,
          title: body.title,
          description: body.description,
          startedAt: new Date(body.startedAt),
          endedAt: body.endedAt ? new Date(body.endedAt) : null,
          performedById: actorId,
        },
      });

      if (existing.operationalStatus !== MachineOperationalStatus.MAINTENANCE) {
        await this.changeOperationalStatus({
          machineId,
          toStatus: MachineOperationalStatus.MAINTENANCE,
          reason: `Maintenance: ${body.title}`,
          actorId,
          tx,
        });
      }
    });

    this.afterMutation(ActivityAction.MACHINE_STATUS_CHANGED, APP_EVENTS.MACHINE_STATUS_CHANGED, {
      machineId,
      actorId,
    });

    return this.getHistory(machineId, role, permissions);
  }

  async getHistory(machineId: string, role: RoleName, permissions: string[]) {
    assertCanViewMachines(role, permissions);
    const existing = await machineRepository.findById(machineId);
    if (!existing) throw ApiError.notFound('Machine not found');

    const [statusHistory, maintenanceRecords, assignments, currentAssignment, completedTasks] =
      await machineRepository.getHistory(machineId);

    return {
      statusHistory: statusHistory.map((row) => ({
        id: row.id,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        reason: row.reason,
        workflowTaskId: row.workflowTaskId,
        assignmentId: row.assignmentId,
        createdAt: row.createdAt.toISOString(),
        changedBy: row.changedBy
          ? `${row.changedBy.firstName} ${row.changedBy.lastName}`.trim()
          : null,
      })),
      maintenanceRecords: maintenanceRecords.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        performedBy: row.performedBy
          ? `${row.performedBy.firstName} ${row.performedBy.lastName}`.trim()
          : null,
      })),
      assignments: assignments.map((row) => ({
        id: row.id,
        status: row.status,
        assignedAt: row.assignedAt.toISOString(),
        completedAt: row.supersededAt?.toISOString() ?? null,
        orderNumber: row.workflowTask.workflowInstance.order.orderNumber,
        stepName: row.workflowTask.workflowStep.stepName,
        taskStatus: row.workflowTask.status,
        operator: `${row.operator.firstName} ${row.operator.lastName}`.trim(),
      })),
      currentTask: currentAssignment
        ? {
            assignmentId: currentAssignment.id,
            taskId: currentAssignment.workflowTask.id,
            taskStatus: currentAssignment.workflowTask.status,
            stepName: currentAssignment.workflowTask.workflowStep.stepName,
            orderNumber: currentAssignment.workflowTask.workflowInstance.order.orderNumber,
          }
        : null,
      completedTasksCount: completedTasks,
    };
  }

  async getOverview(role: RoleName, permissions: string[]) {
    assertCanViewMachines(role, permissions);
    return machineRepository.getOverview();
  }

  async onMachineAssigned(
    machineId: string,
    taskId: string,
    assignmentId: string,
    actorId?: string,
  ) {
    await this.changeOperationalStatus({
      machineId,
      toStatus: MachineOperationalStatus.BUSY,
      reason: 'Assigned to production task',
      actorId,
      workflowTaskId: taskId,
      assignmentId,
    });

    this.afterMutation(ActivityAction.MACHINE_ASSIGNED, APP_EVENTS.MACHINE_ASSIGNED, {
      machineId,
      taskId,
      assignmentId,
      actorId,
    });
  }

  async releaseMachineIfIdle(machineId: string, actorId?: string) {
    const activeCount = await machineRepository.countActiveAssignments(machineId);
    if (activeCount > 0) return;

    const machine = await machineRepository.findById(machineId);
    if (!machine || !machine.isActive) return;
    if (machine.operationalStatus === MachineOperationalStatus.MAINTENANCE) return;

    await this.changeOperationalStatus({
      machineId,
      toStatus: MachineOperationalStatus.AVAILABLE,
      reason: 'No active assignments',
      actorId,
    });
  }

  private async changeOperationalStatus(input: StatusChangeInput) {
    const tx = input.tx ?? prisma;
    const machine = await tx.machine.findUnique({
      where: { id: input.machineId },
      select: { operationalStatus: true },
    });
    if (!machine) throw ApiError.notFound('Machine not found');
    if (machine.operationalStatus === input.toStatus) return;

    await tx.machine.update({
      where: { id: input.machineId },
      data: { operationalStatus: input.toStatus },
    });

    await tx.machineStatusHistory.create({
      data: {
        machineId: input.machineId,
        fromStatus: machine.operationalStatus,
        toStatus: input.toStatus,
        reason: input.reason,
        workflowTaskId: input.workflowTaskId,
        assignmentId: input.assignmentId,
        changedById: input.actorId,
      },
    });
  }

  private afterMutation(
    action: ActivityAction,
    event: (typeof APP_EVENTS)[keyof typeof APP_EVENTS],
    payload: Record<string, unknown>,
  ) {
    activityLogService.logAsync({
      action,
      entityType: 'machine',
      entityId: String(payload['machineId']),
      actorId: payload['actorId'] as string | undefined,
      metadata: payload as Prisma.InputJsonValue,
    });
    eventBus.emitEvent(event, payload);
    void machineCache.invalidateAll();
    void controlCenterCache.invalidateAll();
  }
}

export const machineService = new MachineService();

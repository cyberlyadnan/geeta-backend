import {
  Prisma,
  ProductionExecutionAlertType,
  QualityInspectionResult,
  QualityInspectionStatus,
  ReworkStatus,
  WorkflowInstanceStatus,
  WorkflowStepType,
  WorkflowTaskExecutionSessionStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { RUSH_PRIORITIES } from '../queue/queue.constants.js';
import {
  ACTIVE_INSTANCE_STATUSES,
  TIMELINE_FEED_EVENT_TYPES,
} from './control-center.constants.js';
import { computeHeatmapLevel, endOfToday, startOfToday } from './control-center.utils.js';

const ACTIVE_TASK_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.ASSIGNED,
  WorkflowTaskStatus.IN_PROGRESS,
  WorkflowTaskStatus.ON_HOLD,
  WorkflowTaskStatus.PAUSED,
  WorkflowTaskStatus.BLOCKED,
  WorkflowTaskStatus.REWORK,
  WorkflowTaskStatus.REJECTED,
];

export class ControlCenterRepository {
  private bounds() {
    return { todayStart: startOfToday(), todayEnd: endOfToday(), now: new Date() };
  }

  async getFactoryOverview() {
    const { todayStart, todayEnd, now } = this.bounds();

    const [
      totalOrdersToday,
      runningOrders,
      completedToday,
      delayedOrders,
      rushOrders,
      onHold,
      qcPending,
      packingPending,
      dispatchPending,
    ] = await Promise.all([
      prisma.productionOrder.count({
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.workflowInstance.count({
        where: { status: { in: [...ACTIVE_INSTANCE_STATUSES] as WorkflowInstanceStatus[] } },
      }),
      prisma.workflowInstance.count({
        where: {
          status: WorkflowInstanceStatus.COMPLETED,
          completedAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.countDistinctDelayedOrders(now),
      this.countDistinctRushOrders(),
      prisma.workflowTask.count({ where: { status: WorkflowTaskStatus.ON_HOLD } }),
      prisma.workflowTask.count({
        where: {
          workflowStep: { stepType: WorkflowStepType.QUALITY_CHECK },
          status: {
            in: [
              WorkflowTaskStatus.READY,
              WorkflowTaskStatus.ASSIGNED,
              WorkflowTaskStatus.IN_PROGRESS,
            ],
          },
        },
      }),
      prisma.workflowTask.count({
        where: {
          workflowStep: { stepType: WorkflowStepType.PACKAGING },
          status: { in: ACTIVE_TASK_STATUSES },
        },
      }),
      prisma.workflowTask.count({
        where: {
          workflowStep: { stepType: WorkflowStepType.DISPATCH },
          status: { in: ACTIVE_TASK_STATUSES },
        },
      }),
    ]);

    return {
      totalOrdersToday,
      runningOrders,
      completedToday,
      delayedOrders,
      rushOrders,
      onHold,
      qcPending,
      packingPending,
      dispatchPending,
    };
  }

  async listDepartmentsOverview() {
    const { todayStart, todayEnd } = this.bounds();
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, sortOrder: true },
    });

    const [
      statusGroups,
      completedTodayGroups,
      reworkGroups,
      sessionAvgGroups,
      queueAvgRows,
      delayedGroups,
    ] = await Promise.all([
      prisma.workflowTask.groupBy({
        by: ['departmentId', 'status'],
        _count: { _all: true },
      }),
      prisma.workflowTask.groupBy({
        by: ['departmentId'],
        where: {
          status: WorkflowTaskStatus.COMPLETED,
          completedAt: { gte: todayStart, lte: todayEnd },
        },
        _count: { _all: true },
      }),
      prisma.workflowTask.groupBy({
        by: ['departmentId'],
        where: { status: { in: [WorkflowTaskStatus.REWORK, WorkflowTaskStatus.REJECTED] } },
        _count: { _all: true },
      }),
      prisma.workflowTaskExecutionSession.groupBy({
        by: ['departmentId'],
        where: {
          status: WorkflowTaskExecutionSessionStatus.COMPLETED,
          completedAt: { gte: todayStart, lte: todayEnd },
        },
        _avg: { totalDurationSeconds: true },
      }),
      prisma.$queryRaw<Array<{ department_id: string; avg_seconds: number | null }>>`
        SELECT department_id, AVG(EXTRACT(EPOCH FROM (started_at - queued_at)))::float AS avg_seconds
        FROM workflow_tasks
        WHERE started_at >= ${todayStart}
          AND queued_at IS NOT NULL
        GROUP BY department_id
      `,
      prisma.workflowTask.groupBy({
        by: ['departmentId'],
        where: {
          dueAt: { lt: new Date() },
          status: { in: ACTIVE_TASK_STATUSES },
        },
        _count: { _all: true },
      }),
    ]);

    const statusMap = new Map<string, Map<string, number>>();
    for (const row of statusGroups) {
      if (!statusMap.has(row.departmentId)) statusMap.set(row.departmentId, new Map());
      statusMap.get(row.departmentId)!.set(row.status, row._count._all);
    }

    const completedMap = new Map(completedTodayGroups.map((r) => [r.departmentId, r._count._all]));
    const reworkMap = new Map(reworkGroups.map((r) => [r.departmentId, r._count._all]));
    const sessionAvgMap = new Map(
      sessionAvgGroups.map((r) => [r.departmentId, Math.round(r._avg.totalDurationSeconds ?? 0)]),
    );
    const queueAvgMap = new Map(
      queueAvgRows.map((r) => [r.department_id, Math.round(r.avg_seconds ?? 0)]),
    );
    const delayedMap = new Map(delayedGroups.map((r) => [r.departmentId, r._count._all]));

    return departments.map((dept) => {
      const counts = statusMap.get(dept.id) ?? new Map<string, number>();
      const pick = (status: WorkflowTaskStatus) => counts.get(status) ?? 0;
      const activeWorkload =
        pick(WorkflowTaskStatus.READY) +
        pick(WorkflowTaskStatus.ASSIGNED) +
        pick(WorkflowTaskStatus.IN_PROGRESS) +
        pick(WorkflowTaskStatus.PAUSED) +
        pick(WorkflowTaskStatus.BLOCKED) +
        pick(WorkflowTaskStatus.REWORK);
      const delayed = delayedMap.get(dept.id) ?? 0;

      return {
        id: dept.id,
        code: dept.code,
        name: dept.name,
        sortOrder: dept.sortOrder,
        ready: pick(WorkflowTaskStatus.READY),
        assigned: pick(WorkflowTaskStatus.ASSIGNED),
        running: pick(WorkflowTaskStatus.IN_PROGRESS),
        paused: pick(WorkflowTaskStatus.PAUSED),
        blocked: pick(WorkflowTaskStatus.BLOCKED),
        completedToday: completedMap.get(dept.id) ?? 0,
        averageProcessingTimeSeconds: sessionAvgMap.get(dept.id) ?? 0,
        averageQueueTimeSeconds: queueAvgMap.get(dept.id) ?? 0,
        reworkCount: reworkMap.get(dept.id) ?? 0,
        activeWorkload,
        delayed,
        heatmapLevel: computeHeatmapLevel(activeWorkload, delayed),
      };
    });
  }

  async getProductionKpis() {
    const { todayStart, todayEnd } = this.bounds();

    const [
      todaysOutput,
      avgProduction,
      avgQc,
      throughputGroups,
      reworkOpen,
      completedTasksToday,
      workInProgress,
    ] = await Promise.all([
      prisma.workflowInstance.count({
        where: {
          status: WorkflowInstanceStatus.COMPLETED,
          completedAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.workflowTaskExecutionSession.aggregate({
        where: {
          status: WorkflowTaskExecutionSessionStatus.COMPLETED,
          completedAt: { gte: todayStart, lte: todayEnd },
        },
        _avg: { totalDurationSeconds: true },
      }),
      prisma.qualityInspection.aggregate({
        where: {
          status: QualityInspectionStatus.COMPLETED,
          completedAt: { gte: todayStart, lte: todayEnd },
        },
        _avg: { durationSeconds: true },
      }),
      prisma.workflowTask.groupBy({
        by: ['departmentId'],
        where: {
          status: WorkflowTaskStatus.COMPLETED,
          completedAt: { gte: todayStart, lte: todayEnd },
        },
        _count: { _all: true },
      }),
      prisma.reworkRequest.count({
        where: { status: { in: [ReworkStatus.OPEN, ReworkStatus.IN_PROGRESS] } },
      }),
      prisma.workflowTask.count({
        where: {
          status: WorkflowTaskStatus.COMPLETED,
          completedAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.workflowTask.count({
        where: { status: { in: [WorkflowTaskStatus.IN_PROGRESS, WorkflowTaskStatus.ASSIGNED] } },
      }),
    ]);

    const onTimeRows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM workflow_tasks
      WHERE status = 'COMPLETED'
        AND completed_at >= ${todayStart}
        AND completed_at <= ${todayEnd}
        AND due_at IS NOT NULL
        AND completed_at <= due_at
    `;

    const onTimeCount = Number(onTimeRows[0]?.count ?? 0);
    const deptThroughput = await this.mapDepartmentThroughput(throughputGroups);

    return {
      todaysOutput,
      averageProductionTimeSeconds: Math.round(avgProduction._avg.totalDurationSeconds ?? 0),
      averageQcTimeSeconds: Math.round(avgQc._avg.durationSeconds ?? 0),
      departmentThroughput: deptThroughput,
      reworkCount: reworkOpen,
      reworkPercent:
        completedTasksToday > 0 ? Math.round((reworkOpen / completedTasksToday) * 100) : 0,
      onTimePercent:
        completedTasksToday > 0 ? Math.round((onTimeCount / completedTasksToday) * 100) : 0,
      workInProgress,
    };
  }

  async getTimelineFeed(limit = 50) {
    const rows = await prisma.workflowTimelineEvent.findMany({
      where: { eventType: { in: [...TIMELINE_FEED_EVENT_TYPES] } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        eventType: true,
        title: true,
        description: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        workflowInstanceId: true,
        workflowInstance: {
          select: {
            order: { select: { id: true, orderNumber: true, orderName: true } },
          },
        },
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return rows;
  }

  async getAlerts(limit = 30) {
    const { now } = this.bounds();
    const todayStart = startOfToday();

    const [
      rushTasks,
      delayedTasks,
      holdTasks,
      qcFailures,
      supervisorRequests,
      reworkRequests,
      slaBreaches,
    ] = await Promise.all([
      prisma.workflowTask.findMany({
        where: {
          priority: { in: [...RUSH_PRIORITIES] },
          status: { in: ACTIVE_TASK_STATUSES },
        },
        orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
        take: 8,
        select: this.alertTaskSelect(),
      }),
      prisma.workflowTask.findMany({
        where: {
          dueAt: { lt: now },
          status: { in: ACTIVE_TASK_STATUSES },
        },
        orderBy: { dueAt: 'asc' },
        take: 8,
        select: this.alertTaskSelect(),
      }),
      prisma.workflowTask.findMany({
        where: { status: WorkflowTaskStatus.ON_HOLD },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: this.alertTaskSelect(),
      }),
      prisma.qualityInspection.findMany({
        where: {
          status: QualityInspectionStatus.COMPLETED,
          result: { in: [QualityInspectionResult.FAIL, QualityInspectionResult.REWORK_REQUIRED] },
          completedAt: { gte: todayStart },
        },
        orderBy: { completedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          result: true,
          completedAt: true,
          workflowTask: { select: this.alertTaskSelect() },
        },
      }),
      prisma.workflowTaskExecutionAlert.findMany({
        where: { alertType: ProductionExecutionAlertType.SUPERVISOR_REQUEST },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          notes: true,
          createdAt: true,
          workflowTask: { select: this.alertTaskSelect() },
        },
      }),
      prisma.reworkRequest.findMany({
        where: { status: { in: [ReworkStatus.OPEN, ReworkStatus.IN_PROGRESS] } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          reason: true,
          reworkCycle: true,
          createdAt: true,
          task: { select: this.alertTaskSelect() },
        },
      }),
      prisma.workflowSlaBreach.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          breachMinutes: true,
          createdAt: true,
          task: { select: this.alertTaskSelect() },
        },
      }),
    ]);

    const alerts = [
      ...rushTasks.map((task) => ({
        id: `rush-${task.id}`,
        type: 'RUSH_ORDER' as const,
        severity: 'HIGH' as const,
        title: `Rush order ${task.workflowInstance.order.orderNumber}`,
        description: `${task.workflowStep.stepName} · ${task.department.name}`,
        orderId: task.workflowInstance.order.id,
        orderNumber: task.workflowInstance.order.orderNumber,
        taskId: task.id,
        departmentId: task.departmentId,
        createdAt: task.dueAt?.toISOString() ?? task.updatedAt.toISOString(),
      })),
      ...delayedTasks.map((task) => ({
        id: `delayed-${task.id}`,
        type: 'DELAYED_ORDER' as const,
        severity: 'HIGH' as const,
        title: `Delayed ${task.workflowInstance.order.orderNumber}`,
        description: `${task.workflowStep.stepName} overdue`,
        orderId: task.workflowInstance.order.id,
        orderNumber: task.workflowInstance.order.orderNumber,
        taskId: task.id,
        departmentId: task.departmentId,
        createdAt: task.dueAt?.toISOString() ?? task.updatedAt.toISOString(),
      })),
      ...holdTasks.map((task) => ({
        id: `hold-${task.id}`,
        type: 'ORDER_ON_HOLD' as const,
        severity: 'MEDIUM' as const,
        title: `On hold ${task.workflowInstance.order.orderNumber}`,
        description: task.workflowStep.stepName,
        orderId: task.workflowInstance.order.id,
        orderNumber: task.workflowInstance.order.orderNumber,
        taskId: task.id,
        departmentId: task.departmentId,
        createdAt: task.updatedAt.toISOString(),
      })),
      ...qcFailures.map((inspection) => ({
        id: `qc-fail-${inspection.id}`,
        type: 'QC_FAILURE' as const,
        severity: 'HIGH' as const,
        title: `QC failed ${inspection.workflowTask.workflowInstance.order.orderNumber}`,
        description: inspection.result ?? 'FAIL',
        orderId: inspection.workflowTask.workflowInstance.order.id,
        orderNumber: inspection.workflowTask.workflowInstance.order.orderNumber,
        taskId: inspection.workflowTask.id,
        departmentId: inspection.workflowTask.departmentId,
        createdAt: inspection.completedAt?.toISOString() ?? new Date().toISOString(),
      })),
      ...supervisorRequests.map((alert) => ({
        id: `supervisor-${alert.id}`,
        type: 'SUPERVISOR_REQUEST' as const,
        severity: 'MEDIUM' as const,
        title: `Supervisor requested ${alert.workflowTask.workflowInstance.order.orderNumber}`,
        description: alert.notes ?? 'Operator requested supervisor',
        orderId: alert.workflowTask.workflowInstance.order.id,
        orderNumber: alert.workflowTask.workflowInstance.order.orderNumber,
        taskId: alert.workflowTask.id,
        departmentId: alert.workflowTask.departmentId,
        createdAt: alert.createdAt.toISOString(),
      })),
      ...reworkRequests.map((rework) => ({
        id: `rework-${rework.id}`,
        type: 'REWORK' as const,
        severity: 'MEDIUM' as const,
        title: `Rework cycle ${rework.reworkCycle}`,
        description: rework.reason,
        orderId: rework.task.workflowInstance.order.id,
        orderNumber: rework.task.workflowInstance.order.orderNumber,
        taskId: rework.task.id,
        departmentId: rework.task.departmentId,
        createdAt: rework.createdAt.toISOString(),
      })),
      ...slaBreaches.map((breach) => ({
        id: `sla-${breach.id}`,
        type: 'SLA_VIOLATION' as const,
        severity: 'HIGH' as const,
        title: `SLA breach +${breach.breachMinutes}m`,
        description: breach.task.workflowInstance.order.orderNumber,
        orderId: breach.task.workflowInstance.order.id,
        orderNumber: breach.task.workflowInstance.order.orderNumber,
        taskId: breach.task.id,
        departmentId: breach.task.departmentId,
        createdAt: breach.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    return alerts;
  }

  async getOrderDrillDown(orderId: string) {
    return prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        orderName: true,
        status: true,
        estimatedCompletionAt: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            vendorProfile: { select: { businessName: true } },
          },
        },
        items: {
          select: {
            id: true,
            quantity: true,
            productOfferingVersion: {
              select: {
                productOffering: { select: { name: true, displayName: true } },
              },
            },
          },
        },
        workflowInstances: {
          select: {
            id: true,
            status: true,
            currentStepOrder: true,
            startedAt: true,
            completedAt: true,
            timelineEvents: {
              orderBy: { createdAt: 'desc' },
              take: 100,
              select: {
                id: true,
                eventType: true,
                title: true,
                description: true,
                createdAt: true,
                actor: { select: { firstName: true, lastName: true } },
              },
            },
            tasks: {
              orderBy: { stepOrder: 'asc' },
              select: {
                id: true,
                status: true,
                stepOrder: true,
                priority: true,
                dueAt: true,
                startedAt: true,
                completedAt: true,
                department: { select: { id: true, code: true, name: true } },
                workflowStep: { select: { stepCode: true, stepName: true, stepType: true } },
                assignments: {
                  where: { status: 'ACTIVE' },
                  take: 1,
                  select: {
                    operator: { select: { id: true, firstName: true, lastName: true } },
                  },
                },
                qualityInspections: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { id: true, status: true, result: true, completedAt: true },
                },
                productionNotes: {
                  orderBy: { createdAt: 'desc' },
                  take: 20,
                  select: {
                    id: true,
                    text: true,
                    createdAt: true,
                    operator: { select: { firstName: true, lastName: true } },
                  },
                },
                attachments: {
                  orderBy: { createdAt: 'desc' },
                  take: 20,
                  select: {
                    id: true,
                    category: true,
                    createdAt: true,
                    fileAsset: { select: { originalName: true, fileUrl: true, mimeType: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private alertTaskSelect() {
    return {
      id: true,
      departmentId: true,
      status: true,
      priority: true,
      dueAt: true,
      updatedAt: true,
      department: { select: { id: true, code: true, name: true } },
      workflowStep: { select: { stepCode: true, stepName: true } },
      workflowInstance: {
        select: {
          id: true,
          order: { select: { id: true, orderNumber: true, orderName: true } },
        },
      },
    } satisfies Prisma.WorkflowTaskSelect;
  }

  private async countDistinctDelayedOrders(now: Date): Promise<number> {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT wi.order_id)::bigint AS count
      FROM workflow_tasks wt
      INNER JOIN workflow_instances wi ON wi.id = wt.workflow_instance_id
      WHERE wt.due_at IS NOT NULL
        AND wt.due_at < ${now}
        AND wt.status NOT IN ('COMPLETED', 'CANCELLED', 'SKIPPED')
    `;
    return Number(rows[0]?.count ?? 0);
  }

  private async countDistinctRushOrders(): Promise<number> {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT wi.order_id)::bigint AS count
      FROM workflow_tasks wt
      INNER JOIN workflow_instances wi ON wi.id = wt.workflow_instance_id
      WHERE wt.priority IN ('URGENT', 'HIGH')
        AND wt.status NOT IN ('COMPLETED', 'CANCELLED', 'SKIPPED')
    `;
    return Number(rows[0]?.count ?? 0);
  }

  private async mapDepartmentThroughput(
    groups: Array<{ departmentId: string; _count: { _all: number } }>,
  ) {
    if (groups.length === 0) return [];

    const departments = await prisma.department.findMany({
      where: { id: { in: groups.map((g) => g.departmentId) } },
      select: { id: true, code: true, name: true },
    });
    const deptMap = new Map(departments.map((d) => [d.id, d]));

    return groups
      .map((group) => ({
        departmentId: group.departmentId,
        code: deptMap.get(group.departmentId)?.code ?? 'UNKNOWN',
        name: deptMap.get(group.departmentId)?.name ?? 'Unknown',
        completedToday: group._count._all,
      }))
      .sort((a, b) => b.completedToday - a.completedToday);
  }
}

export const controlCenterRepository = new ControlCenterRepository();

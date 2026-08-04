import type { ControlCenterRepository } from './control-center.repository.js';
import { userDisplayName } from './control-center.utils.js';

type TimelineRow = Awaited<ReturnType<ControlCenterRepository['getTimelineFeed']>>[number];
type OrderRow = NonNullable<Awaited<ReturnType<ControlCenterRepository['getOrderDrillDown']>>>;

export function mapFactoryOverview(overview: Awaited<
  ReturnType<ControlCenterRepository['getFactoryOverview']>
>) {
  return overview;
}

export function mapDepartmentsOverview(
  departments: Awaited<ReturnType<ControlCenterRepository['listDepartmentsOverview']>>,
) {
  return departments;
}

export function mapHeatmap(
  departments: Awaited<ReturnType<ControlCenterRepository['listDepartmentsOverview']>>,
) {
  return departments.map((dept) => ({
    departmentId: dept.id,
    code: dept.code,
    name: dept.name,
    activeWorkload: dept.activeWorkload,
    delayed: dept.delayed,
    level: dept.heatmapLevel,
  }));
}

export function mapTimelineItem(row: TimelineRow) {
  return {
    id: row.id,
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    workflowInstanceId: row.workflowInstanceId,
    order: {
      id: row.workflowInstance.order.id,
      orderNumber: row.workflowInstance.order.orderNumber,
      orderName: row.workflowInstance.order.orderName,
    },
    actor: row.actor
      ? {
          id: row.actor.id,
          name: userDisplayName(row.actor.firstName, row.actor.lastName),
        }
      : null,
  };
}

export function mapOrderDrillDown(order: OrderRow) {
  const workflow = order.workflowInstances[0];
  const currentTask =
    workflow?.tasks.find((task) =>
      ['IN_PROGRESS', 'ASSIGNED', 'READY', 'ON_HOLD', 'REWORK', 'PAUSED'].includes(task.status),
    ) ?? workflow?.tasks.find((task) => task.status !== 'COMPLETED');

  return {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      orderName: order.orderName,
      status: order.status,
      estimatedCompletionAt: order.estimatedCompletionAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      customer: order.customer
        ? {
            id: order.customer.id,
            name:
              order.customer.vendorProfile?.businessName ??
              userDisplayName(order.customer.firstName, order.customer.lastName),
          }
        : {
            id: order.retailCustomer?.id ?? '',
            name: order.retailCustomer?.name ?? 'Retail customer',
          },
      items: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        productName:
          item.productOfferingVersion.productOffering.displayName ??
          item.productOfferingVersion.productOffering.name,
      })),
    },
    workflow: workflow
      ? {
          id: workflow.id,
          status: workflow.status,
          currentStepOrder: workflow.currentStepOrder,
          startedAt: workflow.startedAt?.toISOString() ?? null,
          completedAt: workflow.completedAt?.toISOString() ?? null,
          tasks: workflow.tasks.map((task) => ({
            id: task.id,
            status: task.status,
            stepOrder: task.stepOrder,
            priority: task.priority,
            dueAt: task.dueAt?.toISOString() ?? null,
            department: task.department,
            step: task.workflowStep,
            operator: task.assignments[0]?.operator
              ? {
                  id: task.assignments[0].operator.id,
                  name: userDisplayName(
                    task.assignments[0].operator.firstName,
                    task.assignments[0].operator.lastName,
                  ),
                }
              : null,
            qcStatus: task.qualityInspections[0]
              ? {
                  status: task.qualityInspections[0].status,
                  result: task.qualityInspections[0].result,
                  completedAt: task.qualityInspections[0].completedAt?.toISOString() ?? null,
                }
              : null,
          })),
          timeline: workflow.timelineEvents.map((event) => ({
            id: event.id,
            eventType: event.eventType,
            title: event.title,
            description: event.description,
            createdAt: event.createdAt.toISOString(),
            actor: event.actor
              ? userDisplayName(event.actor.firstName, event.actor.lastName)
              : null,
          })),
        }
      : null,
    currentTask: currentTask
      ? {
          id: currentTask.id,
          status: currentTask.status,
          step: currentTask.workflowStep,
          department: currentTask.department,
          operator: currentTask.assignments[0]?.operator
            ? userDisplayName(
                currentTask.assignments[0].operator.firstName,
                currentTask.assignments[0].operator.lastName,
              )
            : null,
          qcStatus: currentTask.qualityInspections[0]?.result ?? null,
        }
      : null,
    productionNotes:
      workflow?.tasks.flatMap((task) =>
        task.productionNotes.map((note) => ({
          id: note.id,
          text: note.text,
          createdAt: note.createdAt.toISOString(),
          operator: userDisplayName(note.operator.firstName, note.operator.lastName),
          stepName: task.workflowStep.stepName,
        })),
      ) ?? [],
    attachments:
      workflow?.tasks.flatMap((task) =>
        task.attachments.map((attachment) => ({
          id: attachment.id,
          category: attachment.category,
          createdAt: attachment.createdAt.toISOString(),
          stepName: task.workflowStep.stepName,
          file: {
            name: attachment.fileAsset.originalName,
            url: attachment.fileAsset.fileUrl,
            mimeType: attachment.fileAsset.mimeType,
          },
        })),
      ) ?? [],
  };
}

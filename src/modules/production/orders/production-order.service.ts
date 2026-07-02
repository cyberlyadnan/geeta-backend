import type { RoleName } from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';
import { printEngineRepository } from '../../print-engine/repositories/print-engine.repository.js';
import { assertCanViewProductionOrders } from './production-order.access.js';
import {
  mapActivityRows,
  mapFilesView,
  mapJobCard,
  mapOrderHealth,
  mapProductionOrderListItem,
  mapProductionOrderOverview,
  mapTasksView,
  mapTimelineRows,
  mapWorkflowView,
} from './production-order.dto.js';
import { buildJobCardPdf } from './job-card.service.js';
import { productionOrderRepository } from './production-order.repository.js';
import type {
  ActivityQuery,
  ListProductionOrdersQuery,
  TimelineQuery,
} from './production-order.validation.js';

export class ProductionOrderService {
  async list(query: ListProductionOrdersQuery, role: RoleName, permissions: string[]) {
    assertCanViewProductionOrders(role, permissions);
    const result = await productionOrderRepository.listCached(query);
    return {
      items: result.items.map(mapProductionOrderListItem),
      meta: { nextCursor: result.nextCursor, hasMore: result.hasMore, limit: result.limit },
    };
  }

  async getById(orderId: string, role: RoleName, permissions: string[]) {
    assertCanViewProductionOrders(role, permissions);
    const order = await productionOrderRepository.findByIdCached(orderId);
    if (!order) throw ApiError.notFound('Production order not found');

    const contextMap = await productionOrderRepository.fetchOrderContextMap([orderId]);
    const context = contextMap.get(orderId) ?? null;

    return {
      overview: mapProductionOrderOverview(order, context),
      health: mapOrderHealth(order, context),
    };
  }

  async getWorkflow(orderId: string, role: RoleName, permissions: string[]) {
    assertCanViewProductionOrders(role, permissions);
    await this.assertOrderExists(orderId);
    const workflow = await productionOrderRepository.getWorkflow(orderId);
    if (!workflow) throw ApiError.notFound('Workflow not found for order');
    return mapWorkflowView(workflow);
  }

  async getTasks(orderId: string, role: RoleName, permissions: string[]) {
    assertCanViewProductionOrders(role, permissions);
    await this.assertOrderExists(orderId);
    const data = await productionOrderRepository.getTasks(orderId);
    if (!data) throw ApiError.notFound('Tasks not found for order');
    return mapTasksView(data);
  }

  async getTimeline(orderId: string, query: TimelineQuery, role: RoleName, permissions: string[]) {
    assertCanViewProductionOrders(role, permissions);
    await this.assertOrderExists(orderId);
    const rows = await productionOrderRepository.getTimeline(orderId, query);
    const workflowEvents = mapTimelineRows(rows, query.limit);

    const orderEvents = await productionOrderRepository.getOrderEvents(orderId);
    const merged = [
      ...workflowEvents.items,
      ...orderEvents.map((e) => ({
        id: `order-event-${e.id}`,
        eventType: e.eventType,
        title: e.title,
        description: e.description,
        entityType: 'PRODUCTION_ORDER',
        entityId: orderId,
        metadata: e.metadata,
        createdAt: e.createdAt.toISOString(),
        actor: e.actor
          ? {
              id: e.actor.id,
              name: `${e.actor.firstName} ${e.actor.lastName}`.trim(),
            }
          : null,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      items: merged.slice(0, query.limit),
      meta: workflowEvents.meta,
    };
  }

  async getFiles(orderId: string, role: RoleName, permissions: string[]) {
    assertCanViewProductionOrders(role, permissions);
    await this.assertOrderExists(orderId);
    const data = await productionOrderRepository.getFiles(orderId);
    if (!data) throw ApiError.notFound('Files not found for order');
    return mapFilesView(data);
  }

  async getActivity(orderId: string, query: ActivityQuery, role: RoleName, permissions: string[]) {
    assertCanViewProductionOrders(role, permissions);
    await this.assertOrderExists(orderId);
    const [activityRows, assignmentHistory] = await Promise.all([
      productionOrderRepository.getActivity(orderId, query),
      productionOrderRepository.getAssignmentHistory(orderId),
    ]);

    const activity = mapActivityRows(activityRows, query.limit);
    return {
      ...activity,
      assignmentHistory: assignmentHistory.map((row) => ({
        id: row.id,
        action: row.action,
        stepName: row.workflowTask.workflowStep.stepName,
        operator: row.operator
          ? `${row.operator.firstName} ${row.operator.lastName}`.trim()
          : null,
        performedBy: row.performedBy
          ? `${row.performedBy.firstName} ${row.performedBy.lastName}`.trim()
          : null,
        machineId: row.machineId,
        previousMachineId: row.previousMachineId,
        priority: row.priority,
        previousPriority: row.previousPriority,
        remarks: row.remarks,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async getArtwork(orderId: string, role: RoleName, permissions: string[]) {
    assertCanViewProductionOrders(role, permissions);
    const order = await productionOrderRepository.findById(orderId);
    if (!order) throw ApiError.notFound('Production order not found');

    const itemId = order.items[0]?.id;
    if (!itemId) return { items: [] };

    const artworks = await printEngineRepository.getOrderArtworkForProduction(itemId);
    return {
      orderItemId: itemId,
      items: artworks.map((artwork) => {
        const version = artwork.pinnedVersion?.artworkVersion;
        return {
          id: artwork.id,
          fileRequirementCode: artwork.fileRequirementCode,
          approvalStatus: artwork.approvalStatus,
          previewUrl: version?.previewUrl ?? null,
          downloadUrl: version?.fileAsset.fileUrl ?? artwork.artworkFile.fileAsset.fileUrl,
          validation: version?.validation ?? null,
          metadata: version?.metadata ?? null,
          coverageAnalyses: version?.coverageAnalyses ?? [],
          versions: artwork.artworkFile.versions.map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            createdAt: v.createdAt.toISOString(),
          })),
          approvedBy: artwork.approvedBy
            ? `${artwork.approvedBy.firstName} ${artwork.approvedBy.lastName}`.trim()
            : null,
        };
      }),
    };
  }

  async getQc(orderId: string, role: RoleName, permissions: string[]) {
    assertCanViewProductionOrders(role, permissions);
    await this.assertOrderExists(orderId);
    const inspections = await productionOrderRepository.getQcHistory(orderId);
    return {
      items: inspections.map((row) => ({
        id: row.id,
        status: row.status,
        result: row.result,
        startedAt: row.startedAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        reworkCycle: row.reworkCycle,
        stepName: row.workflowTask.workflowStep.stepName,
        taskId: row.workflowTask.id,
        inspector: row.inspector
          ? `${row.inspector.firstName} ${row.inspector.lastName}`.trim()
          : null,
        checklist: row.items,
        defects: row.defects,
        attachments: row.attachments.map((a) => ({
          id: a.id,
          createdAt: a.createdAt.toISOString(),
          file: {
            name: a.fileAsset.originalName,
            url: a.fileAsset.fileUrl,
            mimeType: a.fileAsset.mimeType,
          },
        })),
      })),
    };
  }

  async getMachines(orderId: string, role: RoleName, permissions: string[]) {
    assertCanViewProductionOrders(role, permissions);
    await this.assertOrderExists(orderId);
    const data = await productionOrderRepository.getTasks(orderId);
    if (!data) return { assignments: [], current: null };

    const assignments = data.tasks
      .filter((t) => t.assignedMachine || t.assignments.some((a) => a.machine))
      .map((t) => ({
        taskId: t.id,
        stepName: t.workflowStep.stepName,
        status: t.status,
        machine: t.assignments[0]?.machine ?? t.assignedMachine,
        operator: t.assignments[0]?.operator
          ? `${t.assignments[0].operator.firstName} ${t.assignments[0].operator.lastName}`.trim()
          : null,
        startedAt: t.startedAt?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
      }));

    const current = assignments.find((a) =>
      ['IN_PROGRESS', 'ASSIGNED', 'READY', 'REWORK'].includes(
        data.tasks.find((t) => t.id === a.taskId)?.status ?? '',
      ),
    ) ?? null;

    return { current, assignments };
  }

  async getNotes(orderId: string, role: RoleName, permissions: string[]) {
    assertCanViewProductionOrders(role, permissions);
    await this.assertOrderExists(orderId);
    const [data, order, qc, events] = await Promise.all([
      productionOrderRepository.getTasks(orderId),
      productionOrderRepository.findById(orderId),
      productionOrderRepository.getQcHistory(orderId),
      productionOrderRepository.getOrderEvents(orderId),
    ]);

    const notes: Array<{
      id: string;
      type: string;
      text: string;
      createdAt: string;
      author: string | null;
      stepName?: string;
    }> = [];

    if (order?.notes) {
      notes.push({
        id: `order-note-${order.id}`,
        type: 'MANAGER',
        text: order.notes,
        createdAt: order.updatedAt.toISOString(),
        author: null,
      });
    }

    for (const task of data?.tasks ?? []) {
      for (const note of task.productionNotes) {
        notes.push({
          id: note.id,
          type: 'PRODUCTION',
          text: note.text,
          createdAt: note.createdAt.toISOString(),
          author: `${note.operator.firstName} ${note.operator.lastName}`.trim(),
          stepName: task.workflowStep.stepName,
        });
      }
    }

    for (const inspection of qc) {
      if (inspection.remarks) {
        notes.push({
          id: `qc-remark-${inspection.id}`,
          type: 'QC',
          text: inspection.remarks,
          createdAt: inspection.completedAt?.toISOString() ?? inspection.createdAt.toISOString(),
          author: inspection.inspector
            ? `${inspection.inspector.firstName} ${inspection.inspector.lastName}`.trim()
            : null,
          stepName: inspection.workflowTask.workflowStep.stepName,
        });
      }
    }

    for (const event of events) {
      if (event.description) {
        notes.push({
          id: `event-${event.id}`,
          type: 'SYSTEM',
          text: `${event.title}: ${event.description}`,
          createdAt: event.createdAt.toISOString(),
          author: event.actor
            ? `${event.actor.firstName} ${event.actor.lastName}`.trim()
            : null,
        });
      }
    }

    notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { items: notes };
  }

  async getJobCard(orderId: string, role: RoleName, permissions: string[], format?: string) {
    assertCanViewProductionOrders(role, permissions);
    const data = await productionOrderRepository.getJobCardData(orderId);
    if (!data) throw ApiError.notFound('Production order not found');

    const payload = mapJobCard(data);
    if (format === 'pdf') {
      const bytes = await buildJobCardPdf(payload);
      return { format: 'pdf' as const, buffer: Buffer.from(bytes), filename: `${data.orderNumber}-job-card.pdf` };
    }
    return { format: 'json' as const, data: payload };
  }

  private async assertOrderExists(orderId: string) {
    const order = await productionOrderRepository.findById(orderId);
    if (!order) throw ApiError.notFound('Production order not found');
    return order;
  }
}

export const productionOrderService = new ProductionOrderService();

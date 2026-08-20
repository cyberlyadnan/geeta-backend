import {
  DesignApprovalGate,
  DesignTaskSource,
  DesignTaskStatus,
  RoleName,
  WorkflowHistoryAction,
  WorkflowStepType,
  WorkflowTaskStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { workflowEngine } from '../workflow/workflow.engine.js';
import { assertTaskTransition } from '../workflow/task-state-machine.js';
import { recordOrderEvent } from '../orders/order-events.service.js';
import { storageService } from '../../services/storage/storage.service.js';
import { resolveExtension, sanitizeFileName } from '../../services/storage/storage.utils.js';
import {
  notificationDispatchService,
  NotificationDispatchService,
  type PendingNotification,
} from '../../services/notifications/index.js';
import { logger } from '../../logs/logger.js';
import {
  DESIGN_DEPARTMENT_CODE,
  DESIGN_NOTIFICATION_TYPES,
  DESIGN_STEP_CODES,
  MAX_REVISION_ROUNDS,
} from './design-approval.constants.js';
import type {
  PresignDesignAttachmentInput,
  PresignDesignProofInput,
  RegisterDesignAttachmentInput,
} from './design-approval.validation.js';

/** Narrow slice of the Prisma client this service needs — injectable so tests can drive the
 *  whole flow with a hand-rolled fake instead of monkey-patching the real (proxy-based) Prisma
 *  client, which node:test's mock.method cannot patch (see retail-customer.service tests). */
export type DesignApprovalDb = Pick<
  typeof prisma,
  | 'designTask'
  | 'designTaskAttachment'
  | 'designProofVersion'
  | 'productionOrder'
  | 'user'
  | '$transaction'
>;

export interface CreateDesignTaskInput {
  orderId: string;
  matterContent?: string | null;
  /** Snapshotted onto DesignTask.price. Null/undefined means no fee is charged for design on
   *  this order (e.g. no default configured and no override entered). */
  price?: number | null;
  /** Reference material (photos, logos, existing artwork to redo) the vendor uploaded ahead of
   *  placing the order — FileAsset ids, ownership already verified by the caller. */
  attachmentFileAssetIds?: string[];
}

export interface SubmitProofInput {
  designTaskId: string;
  proofUrl: string;
  notes?: string;
  submittedByUserId: string;
}

export interface VendorDecisionInput {
  orderId: string;
  approved: boolean;
  revisionNote?: string;
  vendorUserId: string;
}

export class DesignApprovalService {
  constructor(
    private readonly db: DesignApprovalDb = prisma,
    /** Injected so tests can assert notifications are actually pushed, not merely stored. */
    private readonly notifications: NotificationDispatchService = notificationDispatchService,
  ) {}

  /**
   * A design task doesn't exist yet at this point — the vendor is still filling out the order
   * form — so reference-material uploads are staged as plain FileAssets, keyed by vendor, and
   * only pinned to a DesignTaskAttachment once the order (and its DesignTask) actually gets
   * created. Mirrors how artwork presign/register works ahead of order placement.
   */
  presignAttachment(vendorUserId: string, input: PresignDesignAttachmentInput) {
    return storageService.createPresignedDesignAttachmentUpload(
      vendorUserId,
      input.fileName,
      input.contentType,
      input.fileSize,
    );
  }

  async registerAttachment(vendorUserId: string, input: RegisterDesignAttachmentInput) {
    const ext = resolveExtension(input.mimeType, input.originalName);
    const fileAsset = await prisma.fileAsset.create({
      data: {
        originalName: sanitizeFileName(input.originalName),
        fileName: sanitizeFileName(input.originalName),
        fileKey: input.key,
        fileUrl: input.publicUrl,
        mimeType: input.mimeType,
        extension: ext,
        fileSize: input.fileSize,
        uploadedById: vendorUserId,
      },
      select: { id: true, fileUrl: true, originalName: true },
    });
    return fileAsset;
  }

  /**
   * Called during order placement once the caller has already decided the order needs design
   * work (product's designServiceMode is REQUIRED, or OPTIONAL and the vendor asked for help, or
   * staff forced it for a local/counter order). Always creates a task — deciding whether design
   * work is needed at all is the caller's job (orders.service.ts), not this method's; that keeps
   * "is design wanted" as one decision made in one place instead of duplicated here.
   */
  async createForOrder(
    input: CreateDesignTaskInput,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; source: DesignTaskSource }> {
    const db = tx ?? this.db;
    const task = await db.designTask.create({
      data: {
        orderId: input.orderId,
        source: DesignTaskSource.VENDOR_MATTER,
        matterContent: input.matterContent ?? null,
        status: DesignTaskStatus.PENDING,
        price: input.price ?? null,
      },
      select: { id: true, source: true },
    });

    if (input.attachmentFileAssetIds?.length) {
      await db.designTaskAttachment.createMany({
        data: input.attachmentFileAssetIds.map((fileAssetId) => ({
          designTaskId: task.id,
          fileAssetId,
        })),
      });
    }

    return task;
  }

  /** The design team uploads a proof for the vendor to look at. */
  async submitProof(input: SubmitProofInput) {
    const { result, notifications } = await this.db.$transaction(async (tx) => {
      const task = await tx.designTask.findUnique({
        where: { id: input.designTaskId },
        select: {
          id: true,
          orderId: true,
          status: true,
          order: { select: { id: true, orderNumber: true, customerId: true } },
          _count: { select: { proofs: true } },
        },
      });
      if (!task) throw ApiError.notFound('Design task not found');
      if (task.status === DesignTaskStatus.APPROVED) {
        throw ApiError.badRequest('This design has already been approved');
      }

      const versionNumber = task._count.proofs + 1;

      await tx.designProofVersion.create({
        data: {
          designTaskId: task.id,
          versionNumber,
          proofUrl: input.proofUrl,
          notes: input.notes,
          submittedById: input.submittedByUserId,
        },
      });

      const updated = await tx.designTask.update({
        where: { id: task.id },
        data: {
          status: DesignTaskStatus.AWAITING_VENDOR_APPROVAL,
          proofUrl: input.proofUrl,
        },
        select: { id: true, status: true, proofUrl: true, revisionCount: true },
      });

      await recordOrderEvent(
        task.orderId,
        {
          eventType: 'DESIGN_PROOF_SUBMITTED',
          title: `Proof v${versionNumber} ready for your approval`,
          description: input.notes ?? undefined,
          actorId: input.submittedByUserId,
          metadata: { designTaskId: task.id, versionNumber },
        },
        tx,
      );

      const notifications: PendingNotification[] = [];
      if (task.order.customerId) {
        notifications.push(
          await this.notifications.create(
            {
              userId: task.order.customerId,
              type: DESIGN_NOTIFICATION_TYPES.PROOF_READY,
              title: 'Your design proof is ready',
              body: `Proof v${versionNumber} for order ${task.order.orderNumber} is ready for your approval.`,
              entityType: 'ORDER',
              entityId: task.orderId,
              metadata: {
                designTaskId: task.id,
                versionNumber,
                gate: DesignApprovalGate.DIGITAL_PROOF,
              },
            },
            tx,
          ),
        );
      }

      return {
        result: { ...updated, versionNumber, orderId: task.orderId },
        notifications,
      };
    });

    // Pushed only after the proof is durably saved — see NotificationDispatchService.
    this.notifications.flush(notifications);
    return result;
  }

  /**
   * A designer picks up the next card in the queue. Purely a DesignTask-level status flip — it
   * does not touch the underlying production workflow, so it stays lightweight and safe to call
   * even on orders whose workflow hasn't reached the DESIGN step yet.
   */
  /**
   * The order's active DESIGN-department workflow task, if any — mirrors exactly the predicate
   * order-status-sync.service.ts uses to decide an order is still "in Design", so start/finish
   * here drive the same signal that decides the vendor-facing order stage. Without this, the
   * design queue's Start/Approve buttons only ever touched DesignTask.status (this module's own
   * bookkeeping row) and never the real production WorkflowTask, so the order stayed stuck on
   * "Design" forever even after approval.
   */
  private findActiveDesignWorkflowTask(orderId: string) {
    return prisma.workflowTask.findFirst({
      where: {
        workflowInstance: { orderId },
        department: { code: DESIGN_DEPARTMENT_CODE },
        status: {
          in: [
            WorkflowTaskStatus.PENDING,
            WorkflowTaskStatus.WAITING,
            WorkflowTaskStatus.READY,
            WorkflowTaskStatus.ASSIGNED,
            WorkflowTaskStatus.IN_PROGRESS,
            WorkflowTaskStatus.REWORK,
          ],
        },
      },
      orderBy: { stepOrder: 'asc' },
      select: {
        id: true,
        workflowInstanceId: true,
        status: true,
        workflowStep: { select: { stepType: true, stepCode: true, stepName: true } },
      },
    });
  }

  /**
   * Moves a workflow task up to IN_PROGRESS so it can then be completed — walks the handful of
   * legal task-state-machine hops (PENDING/WAITING → READY → IN_PROGRESS) directly, without
   * pulling in the full execution/session system (assignment, time tracking, pause/resume) that
   * the generic production queues use. That system is still there for departments that want it;
   * design just doesn't need it for the simple start → upload → done flow.
   */
  private async claimWorkflowTask(
    task: { id: string; status: WorkflowTaskStatus },
    actorId: string,
  ): Promise<void> {
    let current = task.status;
    if (current === WorkflowTaskStatus.IN_PROGRESS) return;

    if (current === WorkflowTaskStatus.PENDING || current === WorkflowTaskStatus.WAITING) {
      assertTaskTransition(current, WorkflowTaskStatus.READY);
      await prisma.workflowTask.update({
        where: { id: task.id },
        data: { status: WorkflowTaskStatus.READY, queuedAt: new Date() },
      });
      current = WorkflowTaskStatus.READY;
    }

    assertTaskTransition(current, WorkflowTaskStatus.IN_PROGRESS);
    await prisma.workflowTask.update({
      where: { id: task.id },
      data: { status: WorkflowTaskStatus.IN_PROGRESS, startedAt: new Date() },
    });
    await prisma.workflowTaskHistory.create({
      data: { taskId: task.id, action: WorkflowHistoryAction.STARTED, performedById: actorId },
    });
  }

  async startTask(designTaskId: string, staffUserId: string) {
    const task = await this.db.designTask.findUnique({
      where: { id: designTaskId },
      select: { id: true, status: true, assignedToUserId: true, orderId: true },
    });
    if (!task) throw ApiError.notFound('Design task not found');
    if (
      task.status !== DesignTaskStatus.PENDING &&
      task.status !== DesignTaskStatus.REVISION_REQUESTED
    ) {
      throw ApiError.badRequest('This card is not waiting to be started');
    }

    const updated = await this.db.designTask.update({
      where: { id: designTaskId },
      data: {
        status: DesignTaskStatus.IN_PROGRESS,
        // First designer to hit Start claims it; doesn't reassign it away from whoever already has it.
        assignedToUserId: task.assignedToUserId ?? staffUserId,
      },
      select: { id: true, status: true, assignedToUserId: true, orderId: true },
    });

    // Claim the real production task too, so the order's status (and every other panel reading
    // it — vendor order page, admin order list) reflects that design work has actually begun.
    const workflowTask = await this.findActiveDesignWorkflowTask(updated.orderId);
    if (workflowTask && workflowTask.workflowStep.stepType !== WorkflowStepType.VENDOR_APPROVAL) {
      await this.claimWorkflowTask(workflowTask, staffUserId);
    }

    await recordOrderEvent(updated.orderId, {
      eventType: 'DESIGN_STARTED',
      title: 'Design work started',
      actorId: staffUserId,
      metadata: { designTaskId },
    });

    return updated;
  }

  /** An upload URL for the design team to push a finished design/proof file straight to a task. */
  presignProofUpload(designTaskId: string, input: PresignDesignProofInput) {
    return storageService.createPresignedDesignProofUpload(
      designTaskId,
      input.fileName,
      input.contentType,
      input.fileSize,
    );
  }

  /**
   * The design team marks the card done after confirming approval with the customer directly
   * (over WhatsApp, by phone, in person) rather than through the vendor's in-app decision screen.
   *
   * This drives the order's real production workflow forward — completing the DESIGN
   * department's own "do the design" task, then approving whichever vendor-approval gate opens
   * as a result — using the exact same mechanics a vendor's in-app "Approve" click or an
   * operator's "Complete" click would use (same DesignApprovalDecision audit row, same
   * workflowEngine.advance, same order-status sync). Nothing about the underlying gate/workflow
   * system is bypassed or removed; only the trigger differs. That's what actually moves the
   * vendor-facing order out of "Design" and into "Under Review" once this finishes.
   *
   * Bounded to a few hops: design → proof gate covers the common case. If a template chains
   * further into real-world work a click can't finish on someone's behalf (e.g. producing a
   * physical sample), the loop stops there and the card stays "in progress" rather than being
   * falsely marked approved — someone can click this again once that step is actually done.
   */
  async staffApproveOnBehalf(designTaskId: string, staffUserId: string) {
    const task = await this.db.designTask.findUnique({
      where: { id: designTaskId },
      select: {
        id: true,
        status: true,
        orderId: true,
        order: { select: { id: true, orderNumber: true, customerId: true } },
      },
    });
    if (!task) throw ApiError.notFound('Design task not found');
    if (task.status === DesignTaskStatus.APPROVED) {
      throw ApiError.badRequest('This design has already been approved');
    }

    for (let hop = 0; hop < 5; hop++) {
      const active = await this.findActiveDesignWorkflowTask(task.orderId);
      if (!active) break;

      if (active.workflowStep.stepType === WorkflowStepType.VENDOR_APPROVAL) {
        const gate =
          active.workflowStep.stepCode === DESIGN_STEP_CODES.SAMPLE_APPROVAL
            ? DesignApprovalGate.PHYSICAL_SAMPLE
            : DesignApprovalGate.DIGITAL_PROOF;

        await this.approveGate({
          order: { ...task.order, designTask: { id: task.id } },
          gate,
          open: {
            taskId: active.id,
            workflowInstanceId: active.workflowInstanceId,
            stepName: active.workflowStep.stepName,
          },
          vendorUserId: staffUserId,
        });
        continue;
      }

      // A CUSTOM "do the work" step. Only auto-complete the literal design-creation step —
      // anything else in this department (e.g. SAMPLE_PRODUCTION) is real-world work.
      if (active.workflowStep.stepCode !== DESIGN_STEP_CODES.DESIGN) break;

      await this.claimWorkflowTask(active, staffUserId);
      await workflowEngine.advance({
        workflowInstanceId: active.workflowInstanceId,
        taskId: active.id,
        action: 'complete',
        actorId: staffUserId,
        remarks: 'Design finished — approved with the customer over WhatsApp',
      });
    }

    const stillActive = await this.findActiveDesignWorkflowTask(task.orderId);
    if (stillActive) {
      await this.db.designTask.update({
        where: { id: designTaskId },
        data: { status: DesignTaskStatus.IN_PROGRESS },
      });
      return { gate: null, approved: false as const, advanced: true as const };
    }

    await this.db.designTask.update({
      where: { id: designTaskId },
      data: { status: DesignTaskStatus.APPROVED },
    });
    await recordOrderEvent(task.orderId, {
      eventType: 'DESIGN_APPROVED',
      title: 'Design approved (confirmed with customer directly)',
      actorId: staffUserId,
      metadata: { designTaskId },
    }).catch((err) => {
      logger.warn('Failed to record DESIGN_APPROVED order event', { orderId: task.orderId, err });
    });
    return { gate: null, approved: true as const, advanced: true as const };
  }

  /**
   * The vendor's decision at whichever gate is currently open.
   *
   * The gate is not passed in by the client: it is derived from the workflow's own open
   * VENDOR_APPROVAL task, so a vendor cannot approve the sample gate while the proof gate is what
   * is actually waiting.
   */
  async recordVendorDecision(input: VendorDecisionInput) {
    const open = await workflowEngine.findOpenVendorApprovalTask(input.orderId);
    if (!open) {
      throw ApiError.badRequest('This order has nothing waiting for your approval right now');
    }

    const gate =
      open.stepCode === DESIGN_STEP_CODES.SAMPLE_APPROVAL
        ? DesignApprovalGate.PHYSICAL_SAMPLE
        : DesignApprovalGate.DIGITAL_PROOF;

    const order = await this.db.productionOrder.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        designTask: { select: { id: true, revisionCount: true } },
      },
    });
    if (!order) throw ApiError.notFound('Order not found');
    if (order.customerId !== input.vendorUserId) {
      throw ApiError.forbidden('This order does not belong to you');
    }
    const designTask = order.designTask;
    if (!designTask) {
      throw ApiError.badRequest('This order has no design task');
    }

    if (!input.approved && !input.revisionNote?.trim()) {
      throw ApiError.badRequest('Tell the design team what to change');
    }

    const orderContext = { ...order, designTask };

    return input.approved
      ? this.approveGate({ order: orderContext, gate, open, vendorUserId: input.vendorUserId })
      : this.requestRevision({
          order: orderContext,
          gate,
          open,
          vendorUserId: input.vendorUserId,
          revisionNote: input.revisionNote!.trim(),
        });
  }

  private async approveGate(args: {
    order: {
      id: string;
      orderNumber: string;
      customerId: string | null;
      designTask: { id: string };
    };
    gate: DesignApprovalGate;
    open: { taskId: string; workflowInstanceId: string; stepName: string };
    vendorUserId: string;
  }) {
    const { order, gate, open, vendorUserId } = args;

    const notifications = await this.db.$transaction(async (tx) => {
      await tx.designApprovalDecision.create({
        data: {
          designTaskId: order.designTask.id,
          gate,
          approved: true,
          decidedByUserId: vendorUserId,
          workflowTaskId: open.taskId,
        },
      });

      // Only the final gate marks the design itself approved; passing the proof gate still leaves
      // the sample gate ahead of it.
      if (gate === DesignApprovalGate.PHYSICAL_SAMPLE) {
        await tx.designTask.update({
          where: { id: order.designTask.id },
          data: { status: DesignTaskStatus.APPROVED },
        });
      }

      await recordOrderEvent(
        order.id,
        {
          eventType:
            gate === DesignApprovalGate.DIGITAL_PROOF
              ? 'DESIGN_PROOF_APPROVED'
              : 'DESIGN_SAMPLE_APPROVED',
          title:
            gate === DesignApprovalGate.DIGITAL_PROOF
              ? 'Proof approved — sample production starting'
              : 'Sample approved — full production starting',
          actorId: vendorUserId,
          metadata: { designTaskId: order.designTask.id, gate },
        },
        tx,
      );

      return this.notifyDesignTeam(tx, {
        type: DESIGN_NOTIFICATION_TYPES.APPROVED,
        title: `${gate === DesignApprovalGate.DIGITAL_PROOF ? 'Proof' : 'Sample'} approved`,
        body: `Order ${order.orderNumber} was approved by the customer.`,
        orderId: order.id,
      });
    });

    // Ensure any PENDING/WAITING task is claimed up to READY/IN_PROGRESS before completing.
    const taskRecord = await prisma.workflowTask.findUnique({
      where: { id: open.taskId },
      select: { id: true, status: true },
    });
    if (
      taskRecord &&
      (taskRecord.status === WorkflowTaskStatus.PENDING ||
        taskRecord.status === WorkflowTaskStatus.WAITING)
    ) {
      await this.claimWorkflowTask(taskRecord, vendorUserId);
    }

    // Completing the gate advances the workflow to whatever comes next — sample production after
    // the proof gate, full production after the sample gate.
    const advanceResult = await workflowEngine.advance({
      workflowInstanceId: open.workflowInstanceId,
      taskId: open.taskId,
      action: 'complete',
      actorId: vendorUserId,
      remarks: `Approved by customer at ${open.stepName}`,
    });

    this.notifications.flush(notifications);

    return {
      gate,
      approved: true as const,
      advanced: true as const,
      newlyReadyTaskIds: advanceResult.newlyReadyTaskIds,
    };
  }

  private async requestRevision(args: {
    order: { id: string; orderNumber: string; designTask: { id: string; revisionCount: number } };
    gate: DesignApprovalGate;
    open: { taskId: string; workflowInstanceId: string; stepName: string };
    vendorUserId: string;
    revisionNote: string;
  }) {
    const { order, gate, open, vendorUserId, revisionNote } = args;

    // OPEN QUESTION: the client never set a revision cap, so MAX_REVISION_ROUNDS is null and this
    // never fires. Flipping it to a number is all that is needed to enforce one.
    if (MAX_REVISION_ROUNDS !== null && order.designTask.revisionCount >= MAX_REVISION_ROUNDS) {
      throw ApiError.badRequest(
        `This order has already used its ${MAX_REVISION_ROUNDS} revision rounds — please contact us to continue.`,
      );
    }

    const { notifications } = await this.db.$transaction(async (tx) => {
      await tx.designApprovalDecision.create({
        data: {
          designTaskId: order.designTask.id,
          gate,
          approved: false,
          revisionNote,
          decidedByUserId: vendorUserId,
          workflowTaskId: open.taskId,
        },
      });

      await tx.designTask.update({
        where: { id: order.designTask.id },
        data: {
          status: DesignTaskStatus.REVISION_REQUESTED,
          revisionCount: { increment: 1 },
        },
      });

      await recordOrderEvent(
        order.id,
        {
          eventType:
            gate === DesignApprovalGate.DIGITAL_PROOF
              ? 'DESIGN_PROOF_REVISION'
              : 'DESIGN_SAMPLE_REVISION',
          title: 'Changes requested',
          description: revisionNote,
          actorId: vendorUserId,
          metadata: { designTaskId: order.designTask.id, gate },
        },
        tx,
      );

      const notifications = await this.notifyDesignTeam(tx, {
        type: DESIGN_NOTIFICATION_TYPES.REVISION_REQUESTED,
        title: 'Customer requested changes',
        body: `Order ${order.orderNumber}: ${revisionNote}`,
        orderId: order.id,
      });

      return { notifications };
    });

    // Routes the workflow back — target step comes from the gate's own metadata, so proof-vs-
    // sample routing is template data (see workflowEngine.rejectVendorApproval).
    const routing = await workflowEngine.rejectVendorApproval({
      workflowInstanceId: open.workflowInstanceId,
      taskId: open.taskId,
      actorId: vendorUserId,
      reason: revisionNote,
    });

    this.notifications.flush(notifications);

    return {
      gate,
      approved: false as const,
      advanced: false as const,
      revisionCount: order.designTask.revisionCount + 1,
      routedBackToStepCode: routing.targetStepCode,
    };
  }

  /** Design staff are notified as a group — whoever is assigned picks it up from their queue. */
  private async notifyDesignTeam(
    tx: Prisma.TransactionClient,
    args: { type: string; title: string; body: string; orderId: string },
  ): Promise<PendingNotification[]> {
    const designers = await tx.user.findMany({
      where: {
        deletedAt: null,
        role: { name: { in: [RoleName.STAFF, RoleName.MANAGER] } },
        departmentAssignments: { some: { department: { code: 'DESIGN' } } },
      },
      select: { id: true },
      take: 50,
    });

    const notifications: PendingNotification[] = [];
    for (const designer of designers) {
      notifications.push(
        await this.notifications.create(
          {
            userId: designer.id,
            type: args.type,
            title: args.title,
            body: args.body,
            entityType: 'ORDER',
            entityId: args.orderId,
          },
          tx,
        ),
      );
    }
    return notifications;
  }

  /** What the vendor portal renders: the design task, its proofs, and whether a gate is open. */
  async getForOrder(orderId: string, vendorUserId: string) {
    const order = await this.db.productionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        status: true,
        designTask: {
          select: {
            id: true,
            source: true,
            status: true,
            proofUrl: true,
            matterContent: true,
            revisionCount: true,
            attachments: {
              select: { id: true, fileAsset: { select: { originalName: true, fileUrl: true } } },
            },
            proofs: {
              orderBy: { versionNumber: 'desc' },
              select: {
                id: true,
                versionNumber: true,
                proofUrl: true,
                notes: true,
                createdAt: true,
              },
            },
            decisions: {
              orderBy: { createdAt: 'desc' },
              select: { id: true, gate: true, approved: true, revisionNote: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!order) throw ApiError.notFound('Order not found');
    if (order.customerId !== vendorUserId)
      throw ApiError.forbidden('This order does not belong to you');
    if (!order.designTask) return { orderId: order.id, designTask: null, openGate: null };

    const open = await workflowEngine.findOpenVendorApprovalTask(orderId);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      designTask: {
        ...order.designTask,
        attachments: order.designTask.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileAsset.originalName,
          fileUrl: a.fileAsset.fileUrl,
        })),
        proofs: order.designTask.proofs.map((p) => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
        })),
        decisions: order.designTask.decisions.map((d) => ({
          ...d,
          createdAt: d.createdAt.toISOString(),
        })),
      },
      openGate: open
        ? {
            gate:
              open.stepCode === DESIGN_STEP_CODES.SAMPLE_APPROVAL
                ? DesignApprovalGate.PHYSICAL_SAMPLE
                : DesignApprovalGate.DIGITAL_PROOF,
            stepName: open.stepName,
            taskId: open.taskId,
          }
        : null,
    };
  }

  /** The design department's own work list. */
  async listDesignQueue(query: { status?: DesignTaskStatus; page: number; limit: number }) {
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      this.db.designTask.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          status: true,
          source: true,
          matterContent: true,
          proofUrl: true,
          revisionCount: true,
          createdAt: true,
          attachments: {
            select: {
              id: true,
              fileAsset: { select: { originalName: true, fileUrl: true } },
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderName: true,
              customer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  vendorProfile: { select: { businessName: true } },
                },
              },
            },
          },
          decisions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { gate: true, approved: true, revisionNote: true, createdAt: true },
          },
        },
      }),
      this.db.designTask.count({ where }),
    ]);

    return {
      items: items.map((task) => ({
        id: task.id,
        status: task.status,
        source: task.source,
        matterContent: task.matterContent,
        proofUrl: task.proofUrl,
        revisionCount: task.revisionCount,
        createdAt: task.createdAt.toISOString(),
        attachments: task.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileAsset.originalName,
          fileUrl: a.fileAsset.fileUrl,
        })),
        order: {
          id: task.order.id,
          orderNumber: task.order.orderNumber,
          orderName: task.order.orderName,
          customerName:
            task.order.customer?.vendorProfile?.businessName ??
            (task.order.customer
              ? `${task.order.customer.firstName} ${task.order.customer.lastName}`
              : null),
          // For the "Contact on WhatsApp" button — kept as raw digits/plus, formatted client-side.
          customerPhone: task.order.customer?.phone ?? null,
        },
        latestFeedback: task.decisions[0]
          ? {
              gate: task.decisions[0].gate,
              approved: task.decisions[0].approved,
              revisionNote: task.decisions[0].revisionNote,
              createdAt: task.decisions[0].createdAt.toISOString(),
            }
          : null,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }
}

export const designApprovalService = new DesignApprovalService();

import type { productionOrderRepository, OrderContext } from './production-order.repository.js';

type ListRow = Awaited<ReturnType<typeof productionOrderRepository.list>>['items'][number];
type OrderDetail = NonNullable<Awaited<ReturnType<typeof productionOrderRepository.findById>>>;

function userName(first: string, last: string) {
  return `${first} ${last}`.trim();
}

function decimalToNumber(value: { toNumber(): number } | null | undefined) {
  return value ? value.toNumber() : null;
}

function vendorName(customer: {
  firstName: string;
  lastName: string;
  vendorProfile: { businessName: string } | null;
}) {
  return customer.vendorProfile?.businessName ?? userName(customer.firstName, customer.lastName);
}

function computeSlaStatus(
  estimatedCompletionAt: Date | null | undefined,
  orderStatus: string,
): 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'COMPLETED' | 'UNKNOWN' {
  if (['COMPLETED', 'DELIVERED', 'DISPATCHED', 'CANCELLED'].includes(orderStatus)) {
    return 'COMPLETED';
  }
  if (!estimatedCompletionAt) return 'UNKNOWN';
  const now = Date.now();
  const due = estimatedCompletionAt.getTime();
  if (due < now) return 'BREACHED';
  const hoursLeft = (due - now) / (1000 * 60 * 60);
  if (hoursLeft <= 24) return 'AT_RISK';
  return 'ON_TRACK';
}

function artworkStatusFromItems(
  items: Array<{ orderArtworks: Array<{ approvalStatus: string }> }>,
): string {
  const statuses = items.flatMap((i) => i.orderArtworks.map((a) => a.approvalStatus));
  if (statuses.length === 0) return 'NONE';
  if (statuses.every((s) => s === 'APPROVED')) return 'APPROVED';
  if (statuses.some((s) => s === 'REJECTED')) return 'REJECTED';
  if (statuses.some((s) => s === 'REVISION_REQUESTED')) return 'REVISION_REQUESTED';
  return 'PENDING';
}

function mapCurrentTaskContext(context: OrderContext | null) {
  const task = context?.currentTask;
  if (!task) {
    return {
      currentStage: null,
      currentDepartment: null,
      assignedOperator: null,
      assignedMachine: null,
      priority: null,
      dueAt: null,
      taskId: null,
      taskStatus: null,
    };
  }

  const assignment = task.assignments[0];
  const machine = assignment?.machine ?? task.assignedMachine;

  return {
    currentStage: task.workflowStep.stepName,
    currentDepartment: task.department,
    assignedOperator: assignment
      ? {
          id: assignment.operator.id,
          name: userName(assignment.operator.firstName, assignment.operator.lastName),
        }
      : null,
    assignedMachine: machine
      ? { id: machine.id, machineCode: machine.machineCode, machineName: machine.machineName }
      : null,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null,
    taskId: task.id,
    taskStatus: task.status,
  };
}

export function mapProductionOrderListItem(row: ListRow) {
  const item = row.items[0];
  const product = item?.productOfferingVersion.productOffering;
  const ctx = row.context;
  const taskCtx = mapCurrentTaskContext(ctx);

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    orderName: row.orderName,
    vendor: {
      id: row.customer.id,
      name: vendorName(row.customer),
      code: row.customer.vendorProfile?.vendorCode ?? null,
    },
    product: product
      ? {
          id: product.id,
          name: product.displayName ?? product.name,
          thumbnailUrl: product.thumbnailUrl,
        }
      : null,
    quantity: item?.quantity ?? 0,
    createdAt: row.createdAt.toISOString(),
    workflowStage: taskCtx.currentStage,
    currentDepartment: taskCtx.currentDepartment,
    assignedOperator: taskCtx.assignedOperator,
    assignedMachine: taskCtx.assignedMachine,
    priority: taskCtx.priority,
    dueDate: taskCtx.dueAt,
    status: row.status,
    workflowStatus: ctx?.workflowStatus ?? null,
    isRush: taskCtx.priority === 'URGENT' || taskCtx.priority === 'HIGH',
    reworkCount: ctx?.reworkCount ?? 0,
    slaStatus: computeSlaStatus(row.estimatedCompletionAt, row.status),
    paymentStatus: row.walletDeducted ? 'PAID' : 'UNPAID',
    artworkStatus: null as string | null,
    deliveryPreference: row.deliveryType,
    deliveryStatus: row.deliveryStatus,
    estimatedCompletionAt: row.estimatedCompletionAt?.toISOString() ?? null,
  };
}

export function mapProductionOrderOverview(order: OrderDetail, context: OrderContext | null) {
  const item = order.items[0];
  const product = item?.productOfferingVersion.productOffering;
  const taskCtx = mapCurrentTaskContext(context);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderName: order.orderName,
    status: order.status,
    vendor: {
      id: order.customer.id,
      name: vendorName(order.customer),
      email: order.customer.email,
      phone: order.customer.phone,
      vendorProfile: order.customer.vendorProfile,
    },
    product: product
      ? {
          id: product.id,
          name: product.displayName ?? product.name,
          slug: product.slug,
          thumbnailUrl: product.thumbnailUrl,
        }
      : null,
    quantity: item?.quantity ?? 0,
    pricing: {
      subtotal: decimalToNumber(order.subtotal),
      deliveryCharge: decimalToNumber(order.deliveryCharge),
      taxAmount: decimalToNumber(order.taxAmount),
      totalAmount: decimalToNumber(order.totalAmount),
      priceSnapshot: item?.priceSnapshot ?? null,
    },
    walletTransaction: order.walletTransactions[0]
      ? {
          id: order.walletTransactions[0].id,
          amount: decimalToNumber(order.walletTransactions[0].amount),
          balanceBefore: decimalToNumber(order.walletTransactions[0].balanceBefore),
          balanceAfter: decimalToNumber(order.walletTransactions[0].balanceAfter),
          referenceNumber: order.walletTransactions[0].referenceNumber,
          createdAt: order.walletTransactions[0].createdAt.toISOString(),
        }
      : null,
    delivery: {
      required: order.deliveryRequired,
      type: order.deliveryType,
      address: order.deliveryAddress,
      status: order.deliveryStatus,
    },
    paymentStatus: order.walletDeducted ? 'PAID' : 'UNPAID',
    slaStatus: computeSlaStatus(order.estimatedCompletionAt, order.status),
    expectedCompletionAt: order.estimatedCompletionAt?.toISOString() ?? null,
    artworkStatus: artworkStatusFromItems(order.items),
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    workflowInstanceId: context?.workflowInstanceId ?? null,
    ...taskCtx,
  };
}

export function mapOrderHealth(order: OrderDetail, context: OrderContext | null) {
  const taskCtx = mapCurrentTaskContext(context);
  const now = Date.now();
  const due = order.estimatedCompletionAt?.getTime();
  const slaRemainingMinutes =
    due && due > now ? Math.round((due - now) / (1000 * 60)) : due ? 0 : null;

  const alerts: Array<{ type: string; severity: string; message: string }> = [];
  if (taskCtx.taskStatus === 'ON_HOLD' || order.status === 'ON_HOLD') {
    alerts.push({ type: 'ON_HOLD', severity: 'MEDIUM', message: 'Order is on hold' });
  }
  if (context?.qcFailed) {
    alerts.push({ type: 'QC_FAILED', severity: 'HIGH', message: 'Quality inspection failed' });
  }
  if (computeSlaStatus(order.estimatedCompletionAt, order.status) === 'BREACHED') {
    alerts.push({ type: 'SLA_BREACH', severity: 'HIGH', message: 'SLA deadline breached' });
  }
  if ((context?.reworkCount ?? 0) > 0) {
    alerts.push({
      type: 'REWORK',
      severity: 'MEDIUM',
      message: `${context?.reworkCount} rework cycle(s)`,
    });
  }

  return {
    ...taskCtx,
    slaStatus: computeSlaStatus(order.estimatedCompletionAt, order.status),
    slaRemainingMinutes,
    isDelayed: computeSlaStatus(order.estimatedCompletionAt, order.status) === 'BREACHED',
    reworkCount: context?.reworkCount ?? 0,
    qcStatus: context?.currentTask?.qualityInspections[0]?.result ?? null,
    artworkStatus: artworkStatusFromItems(order.items),
    paymentStatus: order.walletDeducted ? 'PAID' : 'UNPAID',
    walletStatus: order.walletDeducted ? 'DEBITED' : 'PENDING',
    deliveryType: order.deliveryType,
    expectedCompletionAt: order.estimatedCompletionAt?.toISOString() ?? null,
    alerts,
  };
}

export function mapWorkflowView(
  workflow: NonNullable<Awaited<ReturnType<typeof productionOrderRepository.getWorkflow>>>,
) {
  const currentStep = workflow.currentStepOrder;
  return {
    id: workflow.id,
    status: workflow.status,
    currentStepOrder: currentStep,
    startedAt: workflow.startedAt?.toISOString() ?? null,
    completedAt: workflow.completedAt?.toISOString() ?? null,
    template: workflow.workflowTemplate,
    steps: workflow.tasks.map((task) => ({
      id: task.id,
      stepOrder: task.stepOrder,
      stepCode: task.workflowStep.stepCode,
      stepName: task.workflowStep.stepName,
      stepType: task.workflowStep.stepType,
      status: task.status,
      department: task.department,
      priority: task.priority,
      dueAt: task.dueAt?.toISOString() ?? null,
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      expectedMinutes: task.workflowStep.expectedMinutes,
      phase:
        task.status === 'COMPLETED'
          ? 'COMPLETED'
          : task.stepOrder === currentStep
            ? 'CURRENT'
            : ['BLOCKED', 'ON_HOLD', 'REJECTED'].includes(task.status)
              ? 'BLOCKED'
              : task.stepOrder > currentStep
                ? 'UPCOMING'
                : 'COMPLETED',
    })),
  };
}

export function mapTasksView(
  data: NonNullable<Awaited<ReturnType<typeof productionOrderRepository.getTasks>>>,
) {
  return {
    workflowInstanceId: data.id,
    items: data.tasks.map((task) => {
      const assignment = task.assignments[0];
      const durationSeconds = task.executionSessions.reduce(
        (sum, s) => sum + (s.totalDurationSeconds ?? 0),
        0,
      );
      return {
        id: task.id,
        department: task.department,
        step: task.workflowStep,
        status: task.status,
        priority: task.priority,
        operator: assignment
          ? {
              id: assignment.operator.id,
              name: userName(assignment.operator.firstName, assignment.operator.lastName),
              email: assignment.operator.email,
            }
          : null,
        machine: assignment?.machine ?? task.assignedMachine,
        assignmentId: assignment?.id ?? null,
        dueAt: task.dueAt?.toISOString() ?? null,
        startedAt: task.startedAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
        durationSeconds,
        reworkCount: task.reworks.length,
        attachments: task.attachments.map((a) => ({
          id: a.id,
          category: a.category,
          createdAt: a.createdAt.toISOString(),
          file: {
            name: a.fileAsset.originalName,
            url: a.fileAsset.fileUrl,
            mimeType: a.fileAsset.mimeType,
          },
        })),
        instructions: task.instructions,
      };
    }),
  };
}

export function mapTimelineRows(
  rows: Awaited<ReturnType<typeof productionOrderRepository.getTimeline>>,
  limit: number,
) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: items.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      title: row.title,
      description: row.description,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      actor: row.actor
        ? { id: row.actor.id, name: userName(row.actor.firstName, row.actor.lastName) }
        : null,
    })),
    meta: {
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      hasMore,
      limit,
    },
  };
}

export function mapActivityRows(
  rows: Awaited<ReturnType<typeof productionOrderRepository.getActivity>>,
  limit: number,
) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: items.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      actor: row.actor
        ? {
            id: row.actor.id,
            name: userName(row.actor.firstName, row.actor.lastName),
            email: row.actor.email,
          }
        : null,
    })),
    meta: {
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      hasMore,
      limit,
    },
  };
}

export function mapFilesView(
  data: NonNullable<Awaited<ReturnType<typeof productionOrderRepository.getFiles>>>,
) {
  const groups = new Map<string, Array<Record<string, unknown>>>();

  const addFile = (category: string, file: Record<string, unknown>) => {
    const list = groups.get(category) ?? [];
    list.push(file);
    groups.set(category, list);
  };

  for (const item of data.order.items) {
    for (const artwork of item.orderArtworks) {
      const asset =
        artwork.pinnedVersion?.artworkVersion.fileAsset ?? artwork.artworkFile.fileAsset;
      addFile('ARTWORK', {
        id: artwork.id,
        name: asset.originalName,
        url: artwork.pinnedVersion?.artworkVersion.previewUrl ?? asset.fileUrl,
        mimeType: asset.mimeType,
        sizeBytes: 'fileSize' in asset ? (asset as { fileSize?: number }).fileSize ?? null : null,
        requirementCode: artwork.fileRequirementCode,
        approvalStatus: artwork.approvalStatus,
      });
    }
    for (const file of item.files) {
      addFile('ORDER_FILE', {
        id: file.fileAsset.id,
        name: file.fileAsset.originalName,
        url: file.fileAsset.fileUrl,
        mimeType: file.fileAsset.mimeType,
        sizeBytes: file.fileAsset.fileSize,
        requirementCode: file.fileRequirementCode,
      });
    }
  }

  for (const task of data.tasks) {
    for (const attachment of task.attachments) {
      const category = attachment.category?.toUpperCase().includes('QC')
        ? 'QC_IMAGE'
        : attachment.category?.toUpperCase().includes('PRODUCTION')
          ? 'PRODUCTION_FILE'
          : 'PRODUCTION_FILE';
      addFile(category, {
        id: attachment.id,
        name: attachment.fileAsset.originalName,
        url: attachment.fileAsset.fileUrl,
        mimeType: attachment.fileAsset.mimeType,
        sizeBytes: attachment.fileAsset.fileSize,
        stepName: task.workflowStep.stepName,
        category: attachment.category,
      });
    }
  }

  return {
    groups: Array.from(groups.entries()).map(([category, files]) => ({ category, files })),
  };
}

export function mapJobCard(
  data: NonNullable<Awaited<ReturnType<typeof productionOrderRepository.getJobCardData>>>,
) {
  const workflow = data.workflowInstances[0];
  const currentTask =
    workflow?.tasks.find((t) =>
      ['IN_PROGRESS', 'ASSIGNED', 'READY', 'ON_HOLD', 'REWORK'].includes(t.status),
    ) ?? workflow?.tasks[0];
  const item = data.items[0];
  const assignment = currentTask?.assignments[0];

  return {
    orderId: data.id,
    orderNumber: data.orderNumber,
    orderName: data.orderName,
    qrPayload: data.jobCards[0]?.qrCode ?? data.orderNumber,
    jobCardNumber: data.jobCards[0]?.jobCardNumber ?? null,
    vendor: vendorName({
      firstName: data.customer.firstName,
      lastName: data.customer.lastName,
      vendorProfile: data.customer.vendorProfile,
    }),
    product: item
      ? (item.productOfferingVersion.productOffering.displayName ??
        item.productOfferingVersion.productOffering.name)
      : 'Product',
    quantity: item?.quantity ?? 0,
    artworkPreviewUrl:
      item?.orderArtworks[0]?.pinnedVersion?.artworkVersion.previewUrl ?? null,
    workflowSteps:
      workflow?.tasks.map((t) => ({
        stepName: t.workflowStep.stepName,
        status: t.status,
      })) ?? [],
    currentStage: currentTask?.workflowStep.stepName ?? null,
    machine: assignment?.machine ?? null,
    operator: assignment
      ? userName(assignment.operator.firstName, assignment.operator.lastName)
      : null,
    priority: currentTask?.priority ?? null,
    dueDate: currentTask?.dueAt?.toISOString() ?? null,
    instructions: currentTask?.instructions ?? null,
    specialNotes: data.notes,
    status: data.status,
    expectedCompletionAt: data.estimatedCompletionAt?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
  };
}

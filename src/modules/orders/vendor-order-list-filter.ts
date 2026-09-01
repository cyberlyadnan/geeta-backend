import {
  ProductionOrderStatus,
  WorkflowStepType,
  WorkflowTaskStatus,
  type Prisma,
} from '@prisma/client';

/** Workflow task is finished — no longer blocks downstream work. */
const TASK_TERMINAL_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.COMPLETED,
  WorkflowTaskStatus.SKIPPED,
  WorkflowTaskStatus.CANCELLED,
];

const DISPATCH_STEP_FILTER = {
  OR: [
    { stepType: WorkflowStepType.DISPATCH },
    { stepCode: { equals: 'DISPATCH', mode: 'insensitive' as const } },
    { stepCode: { contains: 'DISPATCH', mode: 'insensitive' as const } },
  ],
} satisfies Prisma.WorkflowTemplateStepWhereInput;

/**
 * Production is complete and the dispatch department still has open work — the order belongs on
 * the vendor "Ready for Dispatch" tab until a dispatcher marks the batch dispatched.
 */
export function buildAwaitingDispatchWhere(): Prisma.ProductionOrderWhereInput {
  return {
    OR: [
      { status: ProductionOrderStatus.READY_FOR_DISPATCH },
      {
        status: {
          in: [
            ProductionOrderStatus.IN_PRODUCTION,
            ProductionOrderStatus.QUALITY_CHECK,
            ProductionOrderStatus.CONFIRMED,
            ProductionOrderStatus.ARTWORK_APPROVED,
          ],
        },
        workflowInstances: {
          some: {
            AND: [
              {
                NOT: {
                  tasks: {
                    some: {
                      AND: [
                        { NOT: { workflowStep: DISPATCH_STEP_FILTER } },
                        { status: { notIn: TASK_TERMINAL_STATUSES } },
                      ],
                    },
                  },
                },
              },
              {
                tasks: {
                  some: {
                    AND: [
                      { workflowStep: DISPATCH_STEP_FILTER },
                      { status: { notIn: TASK_TERMINAL_STATUSES } },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}

/** Maps vendor list tab status filters to the correct Prisma where clause. */
export function buildVendorOrderListStatusWhere(
  status: ProductionOrderStatus,
): Prisma.ProductionOrderWhereInput {
  if (status === ProductionOrderStatus.READY_FOR_DISPATCH) {
    return buildAwaitingDispatchWhere();
  }

  if (status === ProductionOrderStatus.IN_PRODUCTION) {
    return {
      status: ProductionOrderStatus.IN_PRODUCTION,
      NOT: buildAwaitingDispatchWhere(),
    };
  }

  if (status === ProductionOrderStatus.DISPATCHED) {
    return { status: ProductionOrderStatus.DISPATCHED };
  }

  return { status };
}

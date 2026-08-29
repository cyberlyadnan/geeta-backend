import { DeliveryStatus, Prisma, ProductionOrderStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { logger } from '../../logs/logger.js';
import { allocateOrderNumber } from '../../modules/orders/order-number.service.js';
import { recordOrderEvent } from '../../modules/orders/order-events.service.js';
import { workflowEngine } from '../../modules/workflow/workflow.engine.js';

export interface CreateReprintOrderInput {
  ticketId: string;
  originalOrderId: string;
  /** Null clones the original quantity — the usual case for "the whole lot came out wrong". */
  quantity?: number | null;
  /** What the vendor pays. Zero (the default) means the reprint is free. */
  chargeAmount: number;
  createdById: string;
  reason: string;
  /** Carry the original artwork across so production does not wait on a re-upload. */
  copyArtwork?: boolean;
}

/** Slow multi-step clone + workflow instantiation must not hit Prisma's default 5s timeout. */
const REPRINT_TX_OPTIONS = { maxWait: 10_000, timeout: 45_000 } as const;

/**
 * Turns an approved reprint ticket into a real production order.
 *
 * Written as its own service rather than reusing `OrdersService.create` on purpose. That method
 * prices the order from the live catalogue and debits the wallet — both wrong here. A reprint is
 * not a second sale: the vendor already paid for this job, and re-pricing it against today's rate
 * card would also mean a rate change since the original order silently changes what the reprint
 * "costs". So this clones the original's frozen snapshots instead, and books the order at whatever
 * the admin decided to charge (normally nothing).
 *
 * What it does share with a normal order is everything downstream: the same workflow template, the
 * same production queues, the same dispatch path. A reprint is a real order that the factory works
 * exactly like any other — it just carries `isReprint` so every screen can badge it, and points
 * back at the order it replaces.
 */
export class ReprintOrderService {
  async create(input: CreateReprintOrderInput) {
    const original = await prisma.productionOrder.findUnique({
      where: { id: input.originalOrderId },
      include: {
        items: {
          include: {
            configurations: true,
            files: true,
            orderArtworks: { include: { pinnedVersion: true } },
          },
        },
      },
    });

    if (!original) throw ApiError.notFound('The original order no longer exists');
    const originalItem = original.items[0];
    if (!originalItem) throw ApiError.badRequest('The original order has no items to reprint');

    if (input.chargeAmount < 0) {
      throw ApiError.badRequest('A reprint charge cannot be negative');
    }

    const quantity = input.quantity && input.quantity > 0 ? input.quantity : originalItem.quantity;
    const charge = Math.round(input.chargeAmount * 100) / 100;
    // Unit price is presentational on a reprint — the charge is decided as a lump sum by whoever
    // approved it, not derived from a rate. Dividing it out keeps the item row internally
    // consistent (unitPrice × quantity === totalPrice) without implying a rate was applied.
    const unitPrice = quantity > 0 ? Math.round((charge / quantity) * 100) / 100 : 0;

    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({
        where: { id: input.ticketId },
        select: { id: true, ticketNumber: true, reprintOrderId: true, vendorUserId: true },
      });
      if (!ticket) throw ApiError.notFound('Support ticket not found');
      // The unique constraint on reprintOrderId would catch this too; checking first turns a
      // database error into a sentence the admin can act on.
      if (ticket.reprintOrderId) {
        throw ApiError.badRequest('A reprint order has already been created for this ticket');
      }

      const orderNumber = await allocateOrderNumber(tx, original.retailCustomerId ? 'RC' : 'GP');

      // A reprint reuses the original's price snapshot rather than creating a new one: the
      // configuration and the product version are identical, and pointing at the same immutable
      // snapshot makes the lineage obvious to anyone reading the two orders side by side.
      const created = await tx.productionOrder.create({
        data: {
          orderNumber,
          customerId: original.customerId,
          retailCustomerId: original.retailCustomerId,
          createdByActorId: input.createdById,
          orderName: `REPRINT — ${original.orderName ?? original.orderNumber}`,
          status: ProductionOrderStatus.CONFIRMED,
          subtotal: new Prisma.Decimal(charge),
          deliveryCharge: new Prisma.Decimal(0),
          taxAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(charge),
          deliveryRequired: original.deliveryRequired,
          deliveryType: original.deliveryType,
          deliveryAddress: original.deliveryAddress,
          deliveryStatus: original.deliveryRequired ? DeliveryStatus.PENDING : null,
          notes: [
            `Reprint of order ${original.orderNumber}`,
            `Support ticket ${ticket.ticketNumber}`,
            input.reason.trim() ? `Reason: ${input.reason.trim()}` : null,
            charge === 0 ? 'No charge — replacement under the reprint policy.' : `Charged ₹${charge.toFixed(2)}`,
          ]
            .filter(Boolean)
            .join('\n'),
          // Never debit a wallet for a reprint, even a charged one: if the business decides to
          // recover part of the cost, that is a conversation and a separate collection, not a
          // silent deduction from a vendor who is already unhappy.
          walletDeducted: false,
          isReprint: true,
          reprintOfOrderId: original.id,
          estimatedCompletionAt: this.estimatedCompletion(),
          items: {
            create: {
              productOfferingVersionId: originalItem.productOfferingVersionId,
              quantity,
              unitPrice: new Prisma.Decimal(unitPrice),
              totalPrice: new Prisma.Decimal(charge),
              priceSnapshotId: originalItem.priceSnapshotId,
              productSnapshot: originalItem.productSnapshot as Prisma.InputJsonValue,
              configurationSnapshot: originalItem.configurationSnapshot as Prisma.InputJsonValue,
              sizeSnapshot: (originalItem.sizeSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              validationSnapshot: (originalItem.validationSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              coverageSnapshot: (originalItem.coverageSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              configurations: {
                create: originalItem.configurations.map((config) => ({
                  fieldCode: config.fieldCode,
                  fieldLabel: config.fieldLabel,
                  fieldType: config.fieldType,
                  optionId: config.optionId,
                  selectedValue: config.selectedValue,
                  selectedLabel: config.selectedLabel,
                })),
              },
            },
          },
        },
        include: { items: true },
      });

      const newItem = created.items[0];
      if (!newItem) throw ApiError.internal('Reprint order item creation failed');

      if (input.copyArtwork !== false) {
        await this.copyArtworkReferences(tx, originalItem, newItem.id);
      }

      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: { reprintOrderId: created.id, reprintChargeAmount: new Prisma.Decimal(charge) },
      });

      await recordOrderEvent(
        created.id,
        {
          eventType: 'REPRINT_ORDER_CREATED',
          title: 'Reprint order created',
          description: `Replacement for order ${original.orderNumber} — approved on ticket ${ticket.ticketNumber}`,
          actorId: input.createdById,
          metadata: {
            originalOrderId: original.id,
            originalOrderNumber: original.orderNumber,
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            charge,
          },
        },
        tx,
      );

      // The original order gets a note too, so anyone opening it later sees that it was reprinted
      // without having to go looking through support.
      await recordOrderEvent(
        original.id,
        {
          eventType: 'REPRINT_ISSUED',
          title: 'Reprint issued',
          description: `Reprint order ${orderNumber} was created for this order`,
          actorId: input.createdById,
          metadata: { reprintOrderId: created.id, reprintOrderNumber: orderNumber, ticketId: ticket.id },
        },
        tx,
      );

      const workflowResult = await workflowEngine.createForProductionOrder(
        {
          orderId: created.id,
          productionOrderItemId: newItem.id,
          productOfferingVersionId: originalItem.productOfferingVersionId,
          createdById: input.createdById,
          metadata: {
            orderNumber,
            isReprint: true,
            originalOrderNumber: original.orderNumber,
            ticketNumber: ticket.ticketNumber,
          },
          // The artwork was approved on the original order, so the reprint enters production with
          // the same signal set — it must not be sent back through design or artwork review for
          // files the business already accepted.
          orderSelections: this.selectionsFrom(originalItem.configurations),
        },
        tx,
      );

      return {
        order: created,
        orderNumber,
        ticketNumber: ticket.ticketNumber,
        vendorUserId: ticket.vendorUserId,
        workflowResult,
      };
    }, REPRINT_TX_OPTIONS);

    workflowEngine.publishCreationEvents(result.workflowResult);

    logger.info('Reprint order created', {
      orderNumber: result.orderNumber,
      originalOrderNumber: original.orderNumber,
      ticketNumber: result.ticketNumber,
      charge,
    });

    return {
      id: result.order.id,
      orderNumber: result.orderNumber,
      orderName: result.order.orderName,
      status: result.order.status,
      quantity,
      chargeAmount: charge,
      originalOrderId: original.id,
      originalOrderNumber: original.orderNumber,
      vendorUserId: result.vendorUserId,
      createdAt: result.order.createdAt.toISOString(),
    };
  }

  /**
   * Re-attaches the original's artwork to the reprint.
   *
   * References, not copies: the same FileAsset and ArtworkFile rows are pointed at again, because
   * the file on storage is byte-identical and duplicating it would double the bill for no benefit.
   * The artwork is marked already-approved, since it was approved on the original order and
   * sending a vendor back through review for a mistake the press made would be absurd.
   */
  private async copyArtworkReferences(
    tx: Prisma.TransactionClient,
    originalItem: {
      files: Array<{ fileRequirementCode: string; fileRequirementLabel: string; fileAssetId: string }>;
      orderArtworks: Array<{
        artworkFileId: string;
        fileRequirementCode: string;
        printLayerCode: string | null;
        pinnedVersion: { artworkVersionId: string } | null;
      }>;
    },
    newItemId: string,
  ): Promise<void> {
    for (const file of originalItem.files) {
      await tx.orderItemFile.create({
        data: {
          orderItemId: newItemId,
          fileRequirementCode: file.fileRequirementCode,
          fileRequirementLabel: file.fileRequirementLabel,
          fileAssetId: file.fileAssetId,
        },
      });
    }

    for (const artwork of originalItem.orderArtworks) {
      const created = await tx.orderArtwork.create({
        data: {
          orderItemId: newItemId,
          artworkFileId: artwork.artworkFileId,
          fileRequirementCode: artwork.fileRequirementCode,
          printLayerCode: artwork.printLayerCode,
          approvalStatus: 'APPROVED',
          adminNotes: 'Carried over from the original order — already approved there.',
          approvedAt: new Date(),
        },
      });

      if (artwork.pinnedVersion) {
        await tx.orderArtworkVersion.create({
          data: {
            orderArtworkId: created.id,
            artworkVersionId: artwork.pinnedVersion.artworkVersionId,
          },
        });
      }
    }
  }

  /** Rebuilds the workflow's selection signal from the cloned configuration rows. */
  private selectionsFrom(
    configurations: Array<{ fieldCode: string; selectedValue: string }>,
  ): Record<string, string> {
    const selections: Record<string, string> = {};
    for (const config of configurations) selections[config.fieldCode] = config.selectedValue;
    // Artwork already exists and is approved — tell any conditional design step to skip itself.
    selections['_has_artwork'] = 'true';
    selections['_is_reprint'] = 'true';
    return selections;
  }

  private estimatedCompletion(): Date {
    // Reprints are corrections of the business's own mistake and are worked ahead of the queue,
    // so they get a tighter default than a fresh order.
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return date;
  }
}

export const reprintOrderService = new ReprintOrderService();

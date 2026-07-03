/**
 * Production Data Reset — business/runtime data only.
 *
 * Removes demo products, orders, workflow/QC/production runtime, wallet
 * transactions, and notifications while preserving ERP master data
 * (users, roles, departments, machines, workflow templates, QC templates,
 * print configuration, etc.).
 *
 * Usage:
 *   npm run reset:production -- --confirm
 *
 * Requires explicit --confirm (or CONFIRM=YES) to run.
 */
import { MachineOperationalStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CONFIRMED =
  process.argv.includes('--confirm') ||
  process.env.CONFIRM === 'YES' ||
  process.env.CONFIRM === 'yes';

const TX_OPTIONS = {
  maxWait: 60_000,
  timeout: 600_000,
} as const;

function logPhase(message: string): void {
  console.log(`✔ ${message}`);
}

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Geeta Print — Production Data Reset');
  console.log('  Business/runtime data only (master data kept)');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  if (!CONFIRMED) {
    console.error('Refusing to run without confirmation.');
    console.error('');
    console.error('  npm run reset:production -- --confirm');
    console.error('  # or: CONFIRM=YES npm run reset:production');
    console.error('');
    process.exitCode = 1;
    return;
  }

  const started = Date.now();

  await prisma.$transaction(async (tx) => {
    // ── 1. QC runtime ────────────────────────────────────────────────
    await tx.qualityInspectionAttachment.deleteMany();
    await tx.qualityInspectionDefect.deleteMany();
    await tx.qualityInspectionItem.deleteMany();
    await tx.reworkRequest.deleteMany();
    await tx.qualityInspection.deleteMany();
    logPhase('QC Runtime Removed');

    // ── 2. Production / workflow runtime ─────────────────────────────
    await tx.workflowTaskExecutionInterval.deleteMany();
    await tx.workflowTaskHold.deleteMany();
    await tx.workflowTaskProductionNote.deleteMany();
    await tx.workflowTaskAttachment.deleteMany();
    await tx.workflowTaskExecutionAlert.deleteMany();
    await tx.workflowTaskExecutionSession.deleteMany();
    await tx.workflowTaskAssignmentHistory.deleteMany();
    await tx.workflowTaskAssignment.deleteMany();
    await tx.workflowTaskHistory.deleteMany();
    await tx.workflowSlaBreach.deleteMany();
    await tx.workflowTaskDependency.deleteMany();
    await tx.workflowTimelineEvent.deleteMany();
    await tx.machineStatusHistory.deleteMany();

    // Job cards restrict-delete on workflow instances — remove first.
    await tx.productionJobCard.deleteMany();
    await tx.workflowTask.deleteMany();
    await tx.workflowInstance.deleteMany();
    logPhase('Workflow Runtime Removed');
    logPhase('Production Runtime Removed');

    // ── 3. Orders (production + legacy checkout + quotes) ────────────
    await tx.orderArtworkVersion.deleteMany();
    await tx.orderArtwork.deleteMany();
    await tx.orderItemConfiguration.deleteMany();
    await tx.orderItemFile.deleteMany();
    await tx.productionOrderEvent.deleteMany();
    await tx.productionOrderItem.deleteMany();
    await tx.productionOrder.deleteMany();

    await tx.orderItem.deleteMany();
    await tx.order.deleteMany();

    await tx.quoteItem.deleteMany();
    await tx.quote.deleteMany();
    logPhase('Orders Removed');

    // ── 4. Wallet / payment business history ─────────────────────────
    await tx.paymentWebhookLog.deleteMany();
    await tx.walletTransaction.deleteMany();
    await tx.financialAuditLog.deleteMany();
    await tx.walletBalanceSnapshot.deleteMany();
    await tx.payment.deleteMany();

    await tx.wallet.updateMany({
      data: {
        currentBalance: 0,
        totalAdded: 0,
        totalSpent: 0,
        totalRefunds: 0,
        lastRechargeAt: null,
      },
    });
    logPhase('Wallet Transactions Removed');

    // ── 5. Artwork pipeline + price snapshots + orphan files ─────────
    await tx.coverageAnalysis.deleteMany();
    await tx.artworkValidation.deleteMany();
    await tx.artworkMetadata.deleteMany();
    await tx.artworkVersion.deleteMany();
    await tx.artworkFile.deleteMany();
    await tx.priceSnapshot.deleteMany();

    await tx.fileAsset.deleteMany({
      where: {
        complianceResponses: { none: {} },
        artworkFile: { is: null },
        artworkVersions: { none: {} },
        orderItemFiles: { none: {} },
        taskAttachments: { none: {} },
        productionNoteFiles: { none: {} },
        qcInspectionAttachments: { none: {} },
        qcDefectAttachments: { none: {} },
      },
    });

    // ── 6. Product catalog (dependency order) ────────────────────────
    await tx.sizeConfiguration.deleteMany();
    await tx.printSizeStrategy.deleteMany();
    await tx.printSpecification.deleteMany();
    await tx.artworkRule.deleteMany();
    await tx.printLayer.deleteMany();
    await tx.coveragePricingRule.deleteMany();
    await tx.fileRequirementFileType.deleteMany();
    await tx.fileRequirement.deleteMany();
    await tx.productPrintConfig.deleteMany();
    await tx.productOfferingWorkflow.deleteMany();
    await tx.bomTemplateItem.deleteMany();
    await tx.bomTemplate.deleteMany();
    await tx.configurationOptionPricing.deleteMany();
    await tx.configurationRule.deleteMany();
    await tx.configurationOption.deleteMany();
    await tx.configurationField.deleteMany();
    await tx.configurationGroup.deleteMany();
    await tx.quantityPricing.deleteMany();
    await tx.pricingRule.deleteMany();
    await tx.productImage.deleteMany();

    // QC templates preserved; productOfferingVersionId SetNull on version delete.
    await tx.productOfferingVersion.deleteMany();
    await tx.productOffering.deleteMany();
    await tx.productSeries.deleteMany();
    await tx.productFamily.deleteMany();

    await tx.category.updateMany({ data: { parentId: null } });
    await tx.category.deleteMany();
    logPhase('Products Removed');

    // ── 7. Notifications & activity ──────────────────────────────────
    await tx.userNotification.deleteMany();
    await tx.vendorOrderDraft.deleteMany();
    await tx.activityLog.deleteMany();
    await tx.auditLog.deleteMany();
    logPhase('Notifications Removed');

    // ── 8. Sequences & machine operational state ─────────────────────
    await tx.orderNumberSequence.updateMany({ data: { lastValue: 0 } });
    await tx.machine.updateMany({
      data: { operationalStatus: MachineOperationalStatus.AVAILABLE },
    });

    // ── Safety assertions ────────────────────────────────────────────
    const remaining = await Promise.all([
      tx.productOffering.count(),
      tx.category.count(),
      tx.productionOrder.count(),
      tx.order.count(),
      tx.workflowInstance.count(),
      tx.qualityInspection.count(),
      tx.walletTransaction.count(),
      tx.userNotification.count(),
    ]);

    const labels = [
      'productOfferings',
      'categories',
      'productionOrders',
      'orders',
      'workflowInstances',
      'qualityInspections',
      'walletTransactions',
      'userNotifications',
    ];
    const dirty = labels
      .map((name, i) => [name, remaining[i]!] as const)
      .filter(([, count]) => count > 0);

    if (dirty.length > 0) {
      throw new Error(
        `Cleanup incomplete — remaining rows: ${dirty
          .map(([name, count]) => `${name}=${count}`)
          .join(', ')}`,
      );
    }
  }, TX_OPTIONS);

  console.log('');
  logPhase('Database Cleaned Successfully');
  console.log('');
  console.log(`Completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log('Master data preserved. Ready for client product import.');
  console.log('');
}

main()
  .catch((error) => {
    console.error('');
    console.error('✖ Production data reset failed');
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    console.error('');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Full business-data reset — catalog, production, masters, vendors.
 *
 * Preserves: schema, migrations, roles, SUPER_ADMIN/ADMIN users, auth tokens,
 * DeliverySettings, SliderSlide (global CMS).
 *
 * Does NOT seed anything.
 *
 * Usage:
 *   npm run reset:database -- --confirm
 */
import { PrismaClient, RoleName } from '@prisma/client';

const prisma = new PrismaClient();

const CONFIRMED =
  process.argv.includes('--confirm') ||
  process.env.CONFIRM === 'YES' ||
  process.env.CONFIRM === 'yes';

const TX_OPTIONS = {
  maxWait: 60_000,
  timeout: 900_000,
} as const;

const PRESERVED_ROLES: RoleName[] = [RoleName.SUPER_ADMIN, RoleName.ADMIN];

function logPhase(message: string): void {
  console.log(`✔ ${message}`);
}

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Geeta Print — Full Database Business Reset');
  console.log('  Catalog + production + masters + vendor data');
  console.log('  Preserves: roles, admin users, auth, global settings');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  if (!CONFIRMED) {
    console.error('Refusing to run without confirmation.');
    console.error('');
    console.error('  npm run reset:database -- --confirm');
    console.error('  # or: CONFIRM=YES npm run reset:database');
    console.error('');
    process.exitCode = 1;
    return;
  }

  const started = Date.now();
  const deleted: Record<string, number> = {};

  const count = async (label: string, fn: () => Promise<{ count: number }>) => {
    const result = await fn();
    deleted[label] = result.count;
    return result;
  };

  await prisma.$transaction(async (tx) => {
    // ── 1. QC runtime ────────────────────────────────────────────────
    await count('qualityInspectionAttachments', () => tx.qualityInspectionAttachment.deleteMany());
    await count('qualityInspectionDefects', () => tx.qualityInspectionDefect.deleteMany());
    await count('qualityInspectionItems', () => tx.qualityInspectionItem.deleteMany());
    await count('reworkRequests', () => tx.reworkRequest.deleteMany());
    await count('qualityInspections', () => tx.qualityInspection.deleteMany());
    logPhase('QC runtime removed');

    // ── 2. Production / workflow runtime ─────────────────────────────
    await count('workflowTaskExecutionIntervals', () => tx.workflowTaskExecutionInterval.deleteMany());
    await count('workflowTaskHolds', () => tx.workflowTaskHold.deleteMany());
    await count('workflowTaskProductionNotes', () => tx.workflowTaskProductionNote.deleteMany());
    await count('workflowTaskAttachments', () => tx.workflowTaskAttachment.deleteMany());
    await count('workflowTaskExecutionAlerts', () => tx.workflowTaskExecutionAlert.deleteMany());
    await count('workflowTaskExecutionSessions', () => tx.workflowTaskExecutionSession.deleteMany());
    await count('workflowTaskAssignmentHistory', () => tx.workflowTaskAssignmentHistory.deleteMany());
    await count('workflowTaskAssignments', () => tx.workflowTaskAssignment.deleteMany());
    await count('workflowTaskHistory', () => tx.workflowTaskHistory.deleteMany());
    await count('workflowSlaBreaches', () => tx.workflowSlaBreach.deleteMany());
    await count('workflowTaskDependencies', () => tx.workflowTaskDependency.deleteMany());
    await count('workflowTimelineEvents', () => tx.workflowTimelineEvent.deleteMany());
    await count('machineStatusHistory', () => tx.machineStatusHistory.deleteMany());
    await count('productionJobCards', () => tx.productionJobCard.deleteMany());
    await count('workflowTasks', () => tx.workflowTask.deleteMany());
    await count('workflowInstances', () => tx.workflowInstance.deleteMany());
    logPhase('Workflow & production runtime removed');

    // ── 3. Orders (production + legacy + quotes) ─────────────────────
    await count('orderArtworkVersions', () => tx.orderArtworkVersion.deleteMany());
    await count('orderArtworks', () => tx.orderArtwork.deleteMany());
    await count('orderItemConfigurations', () => tx.orderItemConfiguration.deleteMany());
    await count('orderItemFiles', () => tx.orderItemFile.deleteMany());
    await count('productionOrderEvents', () => tx.productionOrderEvent.deleteMany());
    await count('productionOrderItems', () => tx.productionOrderItem.deleteMany());
    await count('productionOrders', () => tx.productionOrder.deleteMany());
    await count('orderItems', () => tx.orderItem.deleteMany());
    await count('orders', () => tx.order.deleteMany());
    await count('quoteItems', () => tx.quoteItem.deleteMany());
    await count('quotes', () => tx.quote.deleteMany());
    logPhase('Orders removed');

    // ── 4. Wallet / payments ─────────────────────────────────────────
    await count('paymentWebhookLogs', () => tx.paymentWebhookLog.deleteMany());
    await count('walletTransactions', () => tx.walletTransaction.deleteMany());
    await count('financialAuditLogs', () => tx.financialAuditLog.deleteMany());
    await count('walletBalanceSnapshots', () => tx.walletBalanceSnapshot.deleteMany());
    await count('payments', () => tx.payment.deleteMany());
    await tx.wallet.updateMany({
      data: {
        currentBalance: 0,
        totalAdded: 0,
        totalSpent: 0,
        totalRefunds: 0,
        lastRechargeAt: null,
      },
    });
    logPhase('Wallet & payment history removed');

    // ── 5. Artwork pipeline ───────────────────────────────────────────
    await count('coverageAnalyses', () => tx.coverageAnalysis.deleteMany());
    await count('artworkValidations', () => tx.artworkValidation.deleteMany());
    await count('artworkMetadata', () => tx.artworkMetadata.deleteMany());
    await count('artworkVersions', () => tx.artworkVersion.deleteMany());
    await count('artworkFiles', () => tx.artworkFile.deleteMany());
    await count('priceSnapshots', () => tx.priceSnapshot.deleteMany());
    logPhase('Artwork & pricing snapshots removed');

    // ── 6. Product catalog (version-scoped config first) ─────────────
    await count('sizeConfigurations', () => tx.sizeConfiguration.deleteMany());
    await count('printSizeStrategies', () => tx.printSizeStrategy.deleteMany());
    await count('printSpecifications', () => tx.printSpecification.deleteMany());
    await count('artworkRules', () => tx.artworkRule.deleteMany());
    await count('printLayers', () => tx.printLayer.deleteMany());
    await count('coveragePricingRules', () => tx.coveragePricingRule.deleteMany());
    await count('fileRequirementFileTypes', () => tx.fileRequirementFileType.deleteMany());
    await count('fileRequirements', () => tx.fileRequirement.deleteMany());
    await count('productPrintConfigs', () => tx.productPrintConfig.deleteMany());
    await count('productOfferingWorkflows', () => tx.productOfferingWorkflow.deleteMany());
    await count('bomTemplateItems', () => tx.bomTemplateItem.deleteMany());
    await count('bomTemplates', () => tx.bomTemplate.deleteMany());
    await count('configurationOptionPricing', () => tx.configurationOptionPricing.deleteMany());
    await count('configurationRules', () => tx.configurationRule.deleteMany());
    await count('configurationOptions', () => tx.configurationOption.deleteMany());
    await count('configurationFields', () => tx.configurationField.deleteMany());
    await count('configurationGroups', () => tx.configurationGroup.deleteMany());
    await count('quantityPricing', () => tx.quantityPricing.deleteMany());
    await count('pricingRules', () => tx.pricingRule.deleteMany());
    await count('productImages', () => tx.productImage.deleteMany());
    await count('productOfferingVersions', () => tx.productOfferingVersion.deleteMany());
    await count('productOfferings', () => tx.productOffering.deleteMany());
    await count('productSeries', () => tx.productSeries.deleteMany());
    await count('productFamilies', () => tx.productFamily.deleteMany());
    await tx.category.updateMany({ data: { parentId: null } });
    await count('categories', () => tx.category.deleteMany());
    logPhase('Catalog removed');

    // ── 7. QC templates & workflow masters ───────────────────────────
    await count('qualityChecklistTemplateItems', () => tx.qualityChecklistTemplateItem.deleteMany());
    await count('qualityChecklistTemplates', () => tx.qualityChecklistTemplate.deleteMany());
    await count('workflowTemplateStepDependencies', () => tx.workflowTemplateStepDependency.deleteMany());
    await count('workflowSlaPolicies', () => tx.workflowSlaPolicy.deleteMany());
    await count('workflowTemplateSteps', () => tx.workflowTemplateStep.deleteMany());
    await count('workflowTemplates', () => tx.workflowTemplate.deleteMany());
    logPhase('Workflow templates & QC templates removed');

    // ── 8. Facilities, departments, machines ─────────────────────────
    await count('userDepartmentAssignments', () => tx.userDepartmentAssignment.deleteMany());
    await count('machineMaintenanceRecords', () => tx.machineMaintenanceRecord.deleteMany());
    await count('machines', () => tx.machine.deleteMany());
    await count('departments', () => tx.department.deleteMany());
    await count('facilities', () => tx.facility.deleteMany());
    logPhase('Departments & machines removed');

    // ── 9. Print master configuration ──────────────────────────────────
    await tx.printProcess.updateMany({ data: { defaultSizeTemplateId: null } });
    await count('sizeTemplateItems', () => tx.sizeTemplateItem.deleteMany());
    await count('sizeTemplates', () => tx.sizeTemplate.deleteMany());
    await count('sheetSizes', () => tx.sheetSize.deleteMany());
    await count('measurementUnits', () => tx.measurementUnit.deleteMany());
    await count('printProcesses', () => tx.printProcess.deleteMany());
    await count('printSpecificationTemplates', () => tx.printSpecificationTemplate.deleteMany());
    await count('masterArtworkRules', () => tx.masterArtworkRule.deleteMany());
    await count('masterValidationRules', () => tx.masterValidationRule.deleteMany());
    await count('masterCoverageRules', () => tx.masterCoverageRule.deleteMany());
    await count('fileUploadRuleTemplates', () => tx.fileUploadRuleTemplate.deleteMany());
    logPhase('Print master configuration removed');

    // ── 10. Inventory placeholders ───────────────────────────────────
    await count('materials', () => tx.material.deleteMany());
    await count('materialCategories', () => tx.materialCategory.deleteMany());
    logPhase('Materials removed');

    // ── 11. Vendor / CRM business data ───────────────────────────────
    await count('vendorComplianceResponses', () => tx.vendorComplianceResponse.deleteMany());
    await count('vendorComplianceRequestItems', () => tx.vendorComplianceRequestItem.deleteMany());
    await count('vendorComplianceRequests', () => tx.vendorComplianceRequest.deleteMany());
    await count('adminNotes', () => tx.adminNote.deleteMany());
    await count('contactInquiryActivities', () => tx.contactInquiryActivity.deleteMany());
    await count('contactInquiryNotes', () => tx.contactInquiryNote.deleteMany());
    await count('contactInquiries', () => tx.contactInquiry.deleteMany());
    logPhase('Vendor compliance & contact inquiries removed');

    // ── 12. Notifications, drafts, logs ──────────────────────────────
    await count('userNotifications', () => tx.userNotification.deleteMany());
    await count('vendorOrderDrafts', () => tx.vendorOrderDraft.deleteMany());
    await count('activityLogs', () => tx.activityLog.deleteMany());
    await count('auditLogs', () => tx.auditLog.deleteMany());
    logPhase('Notifications, drafts & logs removed');

    // ── 13. Orphan file assets ─────────────────────────────────────────
    await count('fileAssets', () => tx.fileAsset.deleteMany());
    logPhase('File assets removed');

    // ── 14. Non-admin users (vendors, staff, customers) ──────────────
    const preservedRoles = await tx.role.findMany({
      where: { name: { in: PRESERVED_ROLES } },
      select: { id: true, name: true },
    });
    const preservedRoleIds = preservedRoles.map((r) => r.id);
    if (preservedRoleIds.length === 0) {
      throw new Error('No SUPER_ADMIN/ADMIN roles found — aborting to protect auth.');
    }

    const removedUsers = await tx.user.deleteMany({
      where: { roleId: { notIn: preservedRoleIds } },
    });
    deleted.nonAdminUsers = removedUsers.count;
    logPhase('Non-admin users removed');

    // Vendor profiles cascade with users; zero any remaining wallets
    await tx.wallet.updateMany({
      data: {
        currentBalance: 0,
        totalAdded: 0,
        totalSpent: 0,
        totalRefunds: 0,
        lastRechargeAt: null,
      },
    });

    // ── 15. Reset sequences ──────────────────────────────────────────
    await tx.orderNumberSequence.deleteMany();
    await tx.vendorCodeSequence.updateMany({ data: { lastValue: 1000 } });

    // ── Verification ─────────────────────────────────────────────────
    const checks = {
      products: await tx.productOffering.count(),
      categories: await tx.category.count(),
      families: await tx.productFamily.count(),
      series: await tx.productSeries.count(),
      productVersions: await tx.productOfferingVersion.count(),
      productionOrders: await tx.productionOrder.count(),
      orders: await tx.order.count(),
      workflowTemplates: await tx.workflowTemplate.count(),
      workflowInstances: await tx.workflowInstance.count(),
      workflowTasks: await tx.workflowTask.count(),
      departments: await tx.department.count(),
      machines: await tx.machine.count(),
      printConfigurations: await tx.productPrintConfig.count(),
      qcTemplates: await tx.qualityChecklistTemplate.count(),
      artworkFiles: await tx.artworkFile.count(),
      walletTransactions: await tx.walletTransaction.count(),
      facilities: await tx.facility.count(),
      printProcesses: await tx.printProcess.count(),
      sizeTemplates: await tx.sizeTemplate.count(),
      sheetSizes: await tx.sheetSize.count(),
      quotes: await tx.quote.count(),
      vendorProfiles: await tx.vendorProfile.count(),
      vendorOrderDrafts: await tx.vendorOrderDraft.count(),
      materials: await tx.material.count(),
    };

    const dirty = Object.entries(checks).filter(([, count]) => count > 0);
    if (dirty.length > 0) {
      throw new Error(
        `Cleanup incomplete — remaining rows: ${dirty.map(([k, v]) => `${k}=${v}`).join(', ')}`,
      );
    }

    const kept = {
      roles: await tx.role.count(),
      adminUsers: await tx.user.count(),
      deliverySettings: await tx.deliverySettings.count(),
      sliderSlides: await tx.sliderSlide.count(),
    };

    console.log('');
    console.log('── Verification (must all be 0) ──');
    console.log(`  Products:              ${checks.products}`);
    console.log(`  Categories:            ${checks.categories}`);
    console.log(`  Families:              ${checks.families}`);
    console.log(`  Series:                ${checks.series}`);
    console.log(`  Product Versions:      ${checks.productVersions}`);
    console.log(`  Production Orders:     ${checks.productionOrders}`);
    console.log(`  Orders:                ${checks.orders}`);
    console.log(`  Workflow Templates:    ${checks.workflowTemplates}`);
    console.log(`  Workflow Instances:    ${checks.workflowInstances}`);
    console.log(`  Workflow Tasks:        ${checks.workflowTasks}`);
    console.log(`  Departments:           ${checks.departments}`);
    console.log(`  Machines:              ${checks.machines}`);
    console.log(`  Print Configurations:  ${checks.printConfigurations}`);
    console.log(`  QC Templates:          ${checks.qcTemplates}`);
    console.log(`  Artwork Uploads:       ${checks.artworkFiles}`);
    console.log(`  Wallet Transactions:   ${checks.walletTransactions}`);
    console.log('');
    console.log('── Preserved ──');
    console.log(`  Roles:                 ${kept.roles}`);
    console.log(`  Admin users:           ${kept.adminUsers}`);
    console.log(`  Delivery settings:     ${kept.deliverySettings}`);
    console.log(`  Slider slides:         ${kept.sliderSlides}`);
    console.log('');

    return { checks, kept, deleted };
  }, TX_OPTIONS);

  console.log('');
  logPhase('Database fully cleaned — ready for manual ERP setup');
  console.log('');
  console.log(`Completed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log('No seed data was created.');
  console.log('');
}

main()
  .catch((error) => {
    console.error('');
    console.error('✖ Full database reset failed');
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

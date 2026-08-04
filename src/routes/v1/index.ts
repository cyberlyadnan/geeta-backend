import { Router } from 'express';
import { authRoutes } from '../../modules/auth/auth.routes.js';
import { usersRoutes } from '../../modules/users/users.routes.js';
import { productsRoutes } from '../../modules/products/products.routes.js';
import { categoriesRoutes } from '../../modules/categories/categories.routes.js';
import { ordersRoutes } from '../../modules/orders/orders.routes.js';
import { walletRoutes } from '../../modules/wallet/wallet.routes.js';
import { paymentsRoutes } from '../../modules/payments/payments.routes.js';
import { workflowRoutes } from '../../modules/workflow/workflow.routes.js';
import { reportsRoutes } from '../../modules/reports/reports.routes.js';
import { notificationsRoutes } from '../../modules/notifications/notifications.routes.js';
import { supportRoutes } from '../../modules/support/support.routes.js';
import { expensesRoutes } from '../../modules/expenses/expenses.routes.js';
import { purchasesRoutes } from '../../modules/purchases/purchases.routes.js';
import { dashboardRoutes } from '../../modules/dashboard/dashboard.routes.js';
import { settingsRoutes } from '../../modules/settings/settings.routes.js';
import { contactRoutes } from '../../modules/contact/contact.routes.js';
import { vendorsRoutes } from '../../modules/vendors/index.js';
import { adminVendorsRoutes } from '../../modules/admin-vendors/index.js';
import { sliderRoutes, adminSlidersRoutes } from '../../modules/slider/index.js';
import { storageRoutes } from '../../modules/storage/index.js';
import { adminWalletsRoutes } from '../../modules/admin-wallets/index.js';
import {
  adminProductsRoutes,
  adminFamiliesRoutes,
  adminSeriesRoutes,
  adminCatalogRoutes,
  adminAttributesRoutes,
  adminConfigRulesRoutes,
  adminPricingRulesRoutes,
  adminCategoriesRoutes,
} from '../../modules/admin-products/index.js';
import { publicCatalogRoutes } from '../../modules/products/public-products.routes.js';
import { deliveryRoutes, adminDeliveryRoutes } from '../../modules/delivery/index.js';
import { adminMonitoringRoutes } from '../../modules/admin-monitoring/index.js';
import {
  printJobRoutes,
  adminPrintEngineRoutes,
  productionArtworkRoutes,
} from '../../modules/print-engine/index.js';
import { adminPrintMasterRoutes } from '../../modules/admin-print-master/index.js';
import { rateCatalogRoutes } from '../../modules/rate-catalog/index.js';
import { productionQueueRoutes } from '../../modules/production/queue/index.js';
import { assignmentRoutes } from '../../modules/production/assignment/index.js';
import { executionRoutes } from '../../modules/production/execution/index.js';
import { qcRoutes } from '../../modules/production/qc/index.js';
import { controlCenterRoutes } from '../../modules/production/control-center/index.js';
import { machineRoutes } from '../../modules/production/machines/index.js';
import { productionOrderRoutes } from '../../modules/production/orders/index.js';
import { systemAdminRoutes } from '../../modules/system-admin/index.js';
import { adminWorkflowRoutes } from '../../modules/admin-workflow/index.js';
import { vendorCatalogRoutes } from '../../modules/vendor-catalog/index.js';
import { orderCancellationRoutes } from '../../modules/order-cancellation/index.js';
import { adminPricingSpineRoutes } from '../../modules/admin-pricing-spine/index.js';
import { retailCustomerRoutes } from '../../modules/admin-retail-customers/index.js';
import { adminOrdersRoutes } from '../../modules/admin-orders/index.js';

const v1Router = Router();

v1Router.use('/auth', authRoutes);
v1Router.use('/users', usersRoutes);
v1Router.use('/public', publicCatalogRoutes);
v1Router.use('/products', productsRoutes);
v1Router.use('/categories', categoriesRoutes);
v1Router.use('/orders', ordersRoutes);
v1Router.use('/order-cancellation', orderCancellationRoutes);
v1Router.use('/wallet', walletRoutes);
v1Router.use('/payments', paymentsRoutes);
v1Router.use('/workflow', workflowRoutes);
v1Router.use('/reports', reportsRoutes);
v1Router.use('/notifications', notificationsRoutes);
v1Router.use('/support', supportRoutes);
v1Router.use('/expenses', expensesRoutes);
v1Router.use('/purchases', purchasesRoutes);
v1Router.use('/dashboard', dashboardRoutes);
v1Router.use('/settings', settingsRoutes);
v1Router.use('/delivery', deliveryRoutes);
v1Router.use('/admin/delivery', adminDeliveryRoutes);
v1Router.use('/contact', contactRoutes);
v1Router.use('/vendors', vendorsRoutes);
v1Router.use('/vendor', vendorCatalogRoutes);
v1Router.use('/admin/vendors', adminVendorsRoutes);
v1Router.use('/sliders', sliderRoutes);
v1Router.use('/admin/sliders', adminSlidersRoutes);
v1Router.use('/admin/storage', storageRoutes);
v1Router.use('/admin/wallets', adminWalletsRoutes);
v1Router.use('/admin/products', adminProductsRoutes);
v1Router.use('/admin/attributes', adminAttributesRoutes);
v1Router.use('/admin/config-rules', adminConfigRulesRoutes);
v1Router.use('/admin/pricing-rules', adminPricingRulesRoutes);
v1Router.use('/admin/pricing-spine', adminPricingSpineRoutes);
v1Router.use('/admin/retail-customers', retailCustomerRoutes);
v1Router.use('/admin/orders', adminOrdersRoutes);
v1Router.use('/admin/categories', adminCategoriesRoutes);
v1Router.use('/admin/families', adminFamiliesRoutes);
v1Router.use('/admin/series', adminSeriesRoutes);
v1Router.use('/admin/catalog', adminCatalogRoutes);
v1Router.use('/admin/monitoring', adminMonitoringRoutes);
v1Router.use('/print-jobs', printJobRoutes);
v1Router.use('/rate-catalog', rateCatalogRoutes);
v1Router.use('/admin/print-engine', adminPrintEngineRoutes);
v1Router.use('/admin/print-config', adminPrintMasterRoutes);
v1Router.use('/production/artwork', productionArtworkRoutes);
v1Router.use('/production', productionQueueRoutes);
v1Router.use('/production', assignmentRoutes);
v1Router.use('/production', executionRoutes);
v1Router.use('/production', qcRoutes);
v1Router.use('/production', controlCenterRoutes);
v1Router.use('/production', machineRoutes);
v1Router.use('/production', productionOrderRoutes);
v1Router.use('/admin/system', systemAdminRoutes);
v1Router.use('/admin/workflows', adminWorkflowRoutes);

export { v1Router };

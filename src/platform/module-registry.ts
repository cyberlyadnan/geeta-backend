/**
 * Extension points for future ERP modules.
 * Register new domain modules here without restructuring the monolith.
 *
 * Planned modules (not implemented):
 * - quotation-engine
 * - workflow-engine
 * - production-tracking
 * - inventory
 * - accounting
 * - dispatch
 *
 * Each module should follow: routes → controller → service → repository → Prisma
 * and reuse: contextRepository, read-models, BullMQ queues, observability middleware.
 */
export const PLATFORM_MODULES = {
  AUTH: 'auth',
  VENDORS: 'vendors',
  ORDERS: 'orders',
  WALLET: 'wallet',
  PAYMENTS: 'payments',
  CATALOG: 'catalog',
  DELIVERY: 'delivery',
  MONITORING: 'monitoring',
  // Future:
  QUOTATION: 'quotation',
  WORKFLOW: 'workflow',
  PRODUCTION: 'production',
  INVENTORY: 'inventory',
  ACCOUNTING: 'accounting',
  DISPATCH: 'dispatch',
} as const;

export type PlatformModule = (typeof PLATFORM_MODULES)[keyof typeof PLATFORM_MODULES];

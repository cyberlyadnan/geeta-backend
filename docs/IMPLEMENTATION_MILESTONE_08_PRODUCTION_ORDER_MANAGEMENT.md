# Milestone 8 — Production Order Management Module

Implementation reference for the Geeta Print production order operational workspace.

## Purpose

Production Order Management is **not** a simple order CRUD screen. It is the ERP operational heart for every production order — comparable to SAP Production Orders, EFI Pace job tickets, or PrintIQ jobs.

A Production Manager should be able to open any order and understand its complete lifecycle (placement → artwork → workflow → production → QC → machines → files → audit) **without leaving this module**.

## Architecture

```
Admin UI (/admin/production/orders, /admin/production/orders/:orderId)
        ↓
Production Order API (list, detail, tab endpoints, job card)
        ↓
Production Order Service (RBAC, orchestration, DTO mapping)
        ↓
Production Order Repository (cursor pagination, batch context enrichment)
        ↓
Existing engines (read-only / delegated — no logic duplication)
        ├── Workflow Engine (instances, tasks, steps)
        ├── Assignment Engine (assignment history)
        ├── Execution Engine (sessions, production notes)
        ├── Quality Control Engine (inspections, defects)
        ├── Machine Registry (assigned machines)
        ├── Artwork / Print Engine (artwork for production)
        ├── Timeline (workflow events + order events)
        ├── Activity Log
        └── Order / Pricing repositories (ORDER_DETAIL_SELECT)
        ↓
PostgreSQL + Redis cache (list/detail TTL)
```

Reuses existing platform components:

| Component | Production Order usage |
|-----------|------------------------|
| Workflow Engine | Current stage, task list, workflow graph, step status |
| Assignment Engine | Operator/machine on tasks; assignment history in audit tab |
| Execution Engine | Production notes, task durations, attachments |
| Quality Control Engine | Inspection history, checklist, defects, rework |
| Machine Registry | Assigned machine on list/detail; machines tab |
| Artwork / Print Engine | Artwork tab via `getOrderArtworkForProduction` |
| Timeline | Merged workflow timeline + order events |
| Activity Log | Audit tab with assignment history |
| Control Center | Drill-down panel links to full order detail |
| Redis | List/detail response cache |
| RBAC | `production.order.*` permissions |

## Backend module layout

```
backend/src/modules/production/orders/
├── production-order.constants.ts   # Cache keys, permissions, task status sets
├── production-order.access.ts      # canView / canManage RBAC helpers
├── production-order.validation.ts  # Zod query/param schemas
├── production-order.repository.ts  # Queries, filters, context batching, cache
├── production-order.dto.ts         # List, overview, health, tab mappers
├── production-order.service.ts     # Orchestration; delegates to print engine
├── production-order.controller.ts  # HTTP handlers (JSON + PDF job card)
├── production-order.routes.ts      # Routes under /production/orders
├── production-order.cache.ts       # Prefix invalidation helper
├── job-card.service.ts             # PDF generation (pdf-lib)
├── index.ts
└── __tests__/production-order.unit.test.ts
```

Mounted at `v1Router.use('/production', productionOrderRoutes)` → base path `/api/v1/production/orders`.

## Repositories

### `ProductionOrderRepository`

| Method | Purpose |
|--------|---------|
| `list` / `listCached` | Cursor-paginated order list with filters |
| `findById` / `findByIdCached` | Full order detail via `ORDER_DETAIL_SELECT` |
| `fetchOrderContextMap` | **Batch** enrichment for list rows (workflow, current task, operator, machine, rework, QC) |
| `getWorkflow` | Workflow instance + tasks for graphical view |
| `getTasks` | All workflow tasks with assignments, notes, attachments |
| `getTimeline` | Workflow timeline events (cursor paginated) |
| `getOrderEvents` | Order-level events merged into timeline |
| `getFiles` | Unified files grouped by category |
| `getActivity` | Activity log rows |
| `getAssignmentHistory` | Assignment engine history |
| `getQcHistory` | QC inspections with checklist/defects/attachments |
| `getJobCardData` | Aggregated payload for job card |

### Context enrichment (no N+1 on list)

List query returns minimal `PRODUCTION_ORDER_LIST_SELECT` rows, then **one batch call** `fetchOrderContextMap(orderIds)` attaches:

- Current workflow stage and department
- Active operator and machine
- Priority, due date, task status
- Rework count, QC status, artwork status
- SLA computation (in DTO layer)

## Services

### `ProductionOrderService`

- Enforces `assertCanViewProductionOrders` on every endpoint
- Maps repository rows through DTO functions
- **Artwork tab**: delegates to `printEngineRepository.getOrderArtworkForProduction(orderItemId)` — no artwork logic duplicated
- **Timeline**: merges workflow timeline + order events, sorted chronologically
- **Notes**: aggregates manager notes, production notes, QC remarks, system events
- **Job card**: JSON by default; `?format=pdf` returns PDF buffer via `buildJobCardPdf`

### `JobCardService`

Generates printable job card PDF with order number, vendor, product, workflow stage, machine, operator, priority, due date, quantity, instructions, QR payload.

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/production/orders` | Cursor-paginated list with enterprise filters |
| GET | `/production/orders/:orderId` | Overview + order health sidebar payload |
| GET | `/production/orders/:orderId/workflow` | Graphical workflow steps |
| GET | `/production/orders/:orderId/tasks` | All production tasks |
| GET | `/production/orders/:orderId/timeline` | Chronological timeline (search, eventType, cursor) |
| GET | `/production/orders/:orderId/files` | Unified file manager by category |
| GET | `/production/orders/:orderId/activity` | Activity log + assignment history |
| GET | `/production/orders/:orderId/artwork` | Artwork preview, validation, versions |
| GET | `/production/orders/:orderId/qc` | QC inspection history |
| GET | `/production/orders/:orderId/machines` | Current + historical machine assignments |
| GET | `/production/orders/:orderId/notes` | Production, QC, manager, system notes |
| GET | `/production/orders/:orderId/job-card` | JSON job card; `?format=pdf` for PDF export |

### List query parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `cursor` | cuid | Cursor pagination |
| `limit` | 1–100 (default 25) | Page size |
| `search` | string | Order number, vendor, product, customer ref, workflow ID |
| `status` | ProductionOrderStatus | Order status filter |
| `workflowStatus` | WorkflowInstanceStatus | Workflow instance status |
| `departmentId` | cuid | Filter by task department |
| `operatorId` | cuid | Active assignment operator |
| `machineId` | cuid | Assigned machine |
| `vendorId` | cuid | Customer/vendor |
| `productId` | cuid | Product offering |
| `priority` | WorkflowPriority | Task priority |
| `rush` | boolean | URGENT / HIGH priority |
| `delayed` | boolean | Past due, non-terminal tasks |
| `onHold` | boolean | ON_HOLD tasks or order |
| `qcFailed` | boolean | Orders with FAIL inspections |
| `rework` | boolean | Rework tasks or rework records |
| `fromDate` / `toDate` | ISO datetime | Created date range |
| `paymentStatus` | PAID / UNPAID | Wallet deducted flag |
| `deliveryType` | DeliveryType | Delivery preference |

## RBAC

Permissions (`backend/src/constants/permissions.ts`):

| Permission | Purpose |
|------------|---------|
| `production.order.view` | View production orders (staff) |
| `production.order.view.all` | View all orders |
| `production.order.manage` | Manager actions (future write endpoints) |
| `production.order:*` | Full access |

Access rules (`production-order.access.ts`):

- **SUPER_ADMIN, ADMIN, MANAGER** — always allowed
- **STAFF** — requires `production.order.view`, `production.order.view.all`, `production.order:*`, or `production.control.view` (control center parity)
- Route middleware uses standard role gate; service layer re-checks permissions

Seeded on MANAGER role in `roles.seed.ts`.

## Performance strategy

Designed for **50,000+ orders**:

| Technique | Implementation |
|-----------|----------------|
| Cursor pagination | `(createdAt desc, id desc)` with `take: limit + 1` |
| Minimal selects | `PRODUCTION_ORDER_LIST_SELECT` vs full `ORDER_DETAIL_SELECT` only on detail |
| Batch enrichment | Single `fetchOrderContextMap` per list page — no per-row task queries |
| Aggregated filters | Task filters pushed into Prisma `where` via workflow instance relations |
| Redis cache | List: 30s TTL keyed by query hash; Detail: 45s TTL per orderId |
| Lazy tab loading | Frontend React Query hooks enabled only when tab is active |
| No N+1 | Parallel `Promise.all` for activity + assignment history |

Existing indexes on `production_orders`, `workflow_instances`, `workflow_tasks` are used; no new migration required for M8.

## Caching strategy

```
production-orders:list:{queryHash}  → TTL 30s
production-orders:detail:{orderId}  → TTL 45s
```

`ProductionOrderCache.invalidateAll()` clears prefix on future write mutations. Read-heavy list/detail endpoints benefit from short TTL without stale operational data.

Frontend uses TanStack Query with tab-scoped keys (`production-orders` query key namespace).

## Frontend structure

```
frontend/src/features/production-orders/
├── types/production-order.types.ts
├── constants/query-keys.ts
├── services/production-orders.service.ts
├── hooks/use-production-orders-queries.ts
├── components/
│   ├── production-orders-list-page.tsx
│   ├── production-order-detail-page.tsx
│   └── order-health-panel.tsx
```

### Routes

| Route | Component | Notes |
|-------|-----------|-------|
| `/admin/production/orders` | `ProductionOrdersListPage` | Enterprise data grid |
| `/admin/production/orders/:orderId` | `ProductionOrderDetailPage` | 10-tab workspace + sidebar |
| `/admin/orders` | Redirect | Legacy path → production orders |

Admin sidebar **Orders** menu points to `/admin/production/orders` (no more 404).

### Order list UI

- Sticky toolbar and filter bar (TailAdmin-style)
- Columns: order, vendor, product, stage, operator, machine, priority, SLA, status
- Filters: search, status chips, rush, delayed, on hold (API supports full filter set)
- Cursor pagination via Load more
- Skeleton loading via `AdminListPageShimmer`

### Order detail UI

Split layout: main tabs + sticky **Order Health** sidebar (`order-health-panel.tsx`).

| Tab | Responsibility | Data source |
|-----|----------------|-------------|
| Overview | Summary, vendor, product, pricing, wallet, delivery, current stage | `GET /orders/:id` |
| Artwork | Preview, validation, versions, dimensions, download | `GET /orders/:id/artwork` |
| Workflow | Step graph (completed / current / blocked / upcoming) | `GET /orders/:id/workflow` |
| Production tasks | All tasks with operator, machine, duration, rework | `GET /orders/:id/tasks` |
| Timeline | Chronological events, search-ready | `GET /orders/:id/timeline` |
| Quality control | Inspections, pass/fail, defects | `GET /orders/:id/qc` |
| Machines | Current + assignment history | `GET /orders/:id/machines` |
| Files | Grouped file manager | `GET /orders/:id/files` |
| Notes | Production, QC, manager, system | `GET /orders/:id/notes` |
| Audit log | Activity + assignment history | `GET /orders/:id/activity` |
| Job card | Printable card with QR, PDF export | `GET /orders/:id/job-card` |

Tabs lazy-load via `enabled` flag on React Query hooks.

### Quick actions (detail toolbar)

Links to existing modules — **no duplicated business logic**:

- Open task / department queue
- Open QC workspace
- Open machine detail
- Timeline tab
- Download artwork
- Print / export job card PDF
- View vendor profile
- Workflow admin (global)

Pause/resume/escalate/reassign defer to existing Assignment and Workflow modules via navigation.

### Order health sidebar

Always visible on detail page:

- Current stage, operator, machine, department
- SLA remaining, delay indicator, priority
- Rework count, QC status, artwork status
- Payment / wallet status, delivery type
- Expected completion, outstanding alerts

### Control Center integration

Control Center alert cards open the existing drill-down panel. Panel now includes **Open production order** → `/admin/production/orders/:orderId` for the full M8 workspace.

## Security

- All endpoints require authentication
- Service-layer permission checks beyond route roles
- Vendors use separate vendor portal routes — production order APIs are admin/staff only
- File URLs served through existing signed/asset patterns where applicable

## Future extension points

| Extension | Hook |
|-----------|------|
| Write actions (pause, escalate, reassign) | Add POST/PATCH routes; call existing Assignment/Workflow services |
| Packing / Dispatch tabs | New tabs consuming future M9+ modules |
| Vendor live tracking | Vendor-scoped read API with field masking |
| Planning board | Link from list to planning view using stored capacity fields |
| Advanced list filters UI | Frontend filter drawer → existing query params |
| Real-time updates | WebSocket invalidation of `production-orders:` cache prefix |
| Bulk operations | Batch endpoint with background BullMQ jobs |
| Export | CSV/Excel from list endpoint with cursor stream |

## Explicitly out of scope (M8)

- Packing, dispatch, vendor live tracking
- Planning board, inventory, purchase, accounting
- AI, IoT, machine scheduling
- New workflow/assignment/QC business logic

## Verification

```bash
cd backend
npm run test:production-orders
npx tsc --noEmit

cd ../frontend
npx tsc --noEmit
```

Manual smoke test:

1. Open `/admin/production/orders` — list loads (sidebar Orders no longer 404)
2. Click an order — detail tabs load lazily
3. Job card tab — QR renders; PDF download works
4. Control Center alert → drill-down → **Open production order**

## Success criteria

- Admin **Orders** menu opens Production Order Management (not 404)
- Production Manager can view complete order lifecycle in one module
- All prior milestone engines integrated via read APIs — no duplicated logic
- List performs with cursor pagination and batch context enrichment
- Job card printable with QR code and PDF export

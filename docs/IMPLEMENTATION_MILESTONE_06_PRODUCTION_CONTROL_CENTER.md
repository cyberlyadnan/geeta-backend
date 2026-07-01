# Milestone 6 — Production Control Center

Implementation reference for the Geeta Print factory operations dashboard.

## Purpose

The Production Control Center is the **operational homepage** for Production Managers. It is not a CRUD screen — it aggregates live factory state into one view so leadership can assess health within seconds.

## Architecture

```
Production events (Workflow, Execution, QC, Assignment)
        ↓
Event bus → Redis cache invalidation + Socket.io emit
        ↓
Control Center API (aggregated queries only)
        ↓
Admin UI (/admin/production/control-center)
        ↓
Polling fallback (15–20s) + WebSocket-ready updates
```

Reuses existing engines without duplicating business logic:

| Engine | Control Center usage |
|--------|---------------------|
| Workflow Engine | Running/completed orders, timeline events |
| Department Queue | Department counts, heatmap workload |
| Assignment Engine | Assignment timeline events |
| Execution Engine | Processing time, supervisor alerts |
| QC Engine | QC pending, failures, avg QC time |
| Timeline | Live feed |
| Redis | Dashboard / timeline / alerts cache |

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/production/control-center` | Bundled dashboard (overview + departments + KPIs + heatmap) |
| GET | `/production/control-center/overview` | Factory overview cards |
| GET | `/production/control-center/departments` | Department cards |
| GET | `/production/control-center/kpis` | Production KPIs |
| GET | `/production/control-center/heatmap` | Workload heatmap |
| GET | `/production/control-center/timeline?limit=50` | Live event feed |
| GET | `/production/control-center/alerts?limit=30` | Alerts panel |
| GET | `/production/control-center/orders/:orderId` | Order drill-down |

**RBAC:** `SUPER_ADMIN`, `ADMIN`, `MANAGER` (or `production.control.view` permission).

## Dashboard widgets

### 1. Factory overview

Aggregated counts (no raw task lists):

- Orders today, running, completed today
- Delayed, rush, on hold
- QC pending, packing pending, dispatch pending

### 2. Department overview

Per department via `groupBy` on `workflow_tasks`:

- Ready, assigned, running, paused, blocked
- Completed today, rework count
- Average processing time (execution sessions)
- Average queue time (SQL aggregate on `started_at - queued_at`)
- Heatmap level (green / yellow / red)

Click → department queue route.

### 3. Live timeline

Latest `WorkflowTimelineEvent` rows filtered to operational event types:

`TASK_STARTED`, `TASK_COMPLETED`, `QC_*`, `WORKFLOW_REWORKED`, `TASK_HELD`, `SUPERVISOR_REQUESTED`, assignment events.

### 4. Alerts panel

Merged alert stream from:

- Rush / delayed / on-hold tasks
- QC failures (today)
- Supervisor requests
- Open rework requests
- SLA breaches

Limited to top N per category, sorted by recency.

### 5. Production KPIs

- Today's output (workflows completed)
- Average production & QC time
- Department throughput (completed tasks today)
- Rework %, on-time %, WIP

### 6. Factory heatmap

Per department:

| Level | Condition |
|-------|-----------|
| GREEN | Low workload & few delays |
| YELLOW | Moderate queue or delays |
| RED | High workload or SLA pressure |

Thresholds in `HEATMAP_THRESHOLDS` (`control-center.constants.ts`).

### 7. Order drill-down

Single order fetch with workflow tasks, timeline, notes, attachments, current task, operator, QC status.

## Aggregation strategy

**Never load full task lists for overview.**

| Metric | Strategy |
|--------|----------|
| Status counts | `prisma.workflowTask.groupBy({ by: ['departmentId', 'status'] })` |
| Distinct delayed/rush orders | `COUNT(DISTINCT order_id)` raw SQL |
| Throughput | `groupBy` completed tasks today |
| Avg processing | `groupBy` + `_avg` on execution sessions |
| Avg queue time | SQL `AVG(started_at - queued_at)` |
| Timeline | Indexed query on `workflow_timeline_events.created_at DESC` |

## Caching

| Key | TTL | Content |
|-----|-----|---------|
| `production-control:dashboard:v1` | 20s | Overview bundle |
| `production-control:timeline:v1:{limit}` | 10s | Timeline feed |
| `production-control:alerts:v1:{limit}` | 15s | Alerts |

Invalidated on all production queue / workflow / QC / execution events via `production-queue.listeners.ts`.

## Real-time updates

1. **Polling:** Frontend refetches dashboard every 20s, timeline/alerts every 15s.
2. **WebSocket-ready:** `SOCKET_EVENTS.CONTROL_CENTER_UPDATED` emitted to room `production:control-center` on cache invalidation.
3. Clients can join room `production:control-center` for push refresh (hook-up optional on frontend).

## Performance

Designed for 50,000+ orders:

- Indexed fields: `departmentId + status`, `workflowInstanceId + createdAt`, `dueAt`
- Parallel `Promise.all` for independent aggregates
- Bounded alert/timeline queries (`take: limit`)
- Redis reduces repeated aggregate load under concurrent managers

## Frontend

Route: **`/admin/production/control-center`**

TailAdmin-inspired layout:

- Hero banner + refresh
- KPI stat cards grid
- Department cards with heatmap badges
- Throughput bar chart (CSS, no chart library)
- Timeline + alerts panels
- Order drill-down slide-over panel

Nav: **Operations → Control center (Live badge)**

## Permissions seed

Manager/Admin roles receive `production.control:*`.

## Testing

```bash
npm run test:control-center
```

Unit tests: access control, heatmap thresholds, utility helpers.

## Future machine integration

Machine Registry (later milestone) will extend:

- Department cards with machine utilization
- Heatmap inputs from machine capacity
- Alerts for down machines

Current module leaves hooks via shared event invalidation — no schema changes required now.

## Out of scope (later milestones)

Machine Registry, Packing module, Dispatch module, Inventory, Planning Board, Vendor Live Tracking.

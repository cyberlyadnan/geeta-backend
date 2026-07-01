# Milestone 7 — Machine Registry & Capacity Management (Level 1)

Implementation reference for the Geeta Print production machine registry module.

## Purpose

The Machine Registry is a **management module for production resources**. It is not IoT, not automation, and not scheduling. Machines are manually registered, updated, and optionally assigned to workflow tasks through the existing Assignment Engine.

Future IoT integration should attach to this module via `metadata` JSON and status history — no architectural redesign required.

## Architecture

```
Admin / Manager UI (/admin/production/machines)
        ↓
Machine API (CRUD, status, maintenance, history, overview)
        ↓
Machine Service + Repository (cursor pagination, Redis cache)
        ↓
PostgreSQL (machines, status history, maintenance records)
        ↓
Assignment Engine (optional machineId on assign/reassign)
        ↓
Event bus → Redis invalidation + Control Center refresh
```

Reuses existing platform components:

| Component | Machine Registry usage |
|-----------|------------------------|
| Assignment Engine | Optional `machineId` on assign/reassign; history stores machine changes |
| Execution Engine | Releases machine to AVAILABLE when task completes |
| Production Control Center | Machine fleet overview widget on dashboard |
| Timeline / Activity log | `MACHINE_*` activity actions |
| Redis | List/overview cache with prefix invalidation |
| RBAC | `production.machine.view` / `production.machine.manage` |

## Data model

### Machine master

Core fields on `machines`:

- Identity: `machineCode`, `machineName`, `departmentId`, `facilityId`
- Spec: `machineType`, `manufacturer`, `model`, `capabilities`, `supportedProcesses`
- Size: min/max sheet dimensions, max print area
- Capacity: `capacityPerHour`, `workingHours` (JSON), `averageRuntimeMinutes`, `supportedProductIds`
- Status: `operationalStatus` (AVAILABLE, BUSY, RESERVED, MAINTENANCE, OFFLINE), `isActive`
- Extensibility: `notes`, `metadata` (JSON — IoT-ready)

Legacy `status` (`ACTIVE` / `DECOMMISSIONED`) remains for archive compatibility.

### Supporting tables

- `machine_status_history` — every operational status change with reason, actor, optional task/assignment link
- `machine_maintenance_records` — basic maintenance log (title, description, started/ended)

### Assignment integration

Existing fields reused (no schema redesign):

- `workflow_tasks.assigned_machine_id`
- `workflow_task_assignments.machine_id`
- `workflow_task_assignment_history.machine_id` / `previous_machine_id`

## Machine lifecycle

1. **Create** — Manager registers machine → `AVAILABLE`, initial status history row, `MACHINE_CREATED` event
2. **Assign** — Assignment Engine validates machine is active, same department, status AVAILABLE or RESERVED → sets `BUSY`, logs `MACHINE_ASSIGNED`
3. **Work** — Operator sees assigned machine in My Tasks / task workspace (read-only)
4. **Complete / Unassign** — When no active assignments remain, machine returns to `AVAILABLE` (unless in MAINTENANCE)
5. **Maintenance** — Manager logs maintenance record → status moves to `MAINTENANCE` if not already
6. **Archive** — `isActive = false`, legacy status DECOMMISSIONED, operational status OFFLINE, `MACHINE_ARCHIVED`
7. **Restore** — Reactivates machine → `AVAILABLE`

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/production/machines/overview` | Fleet counts + utilization |
| GET | `/production/machines` | Cursor-paginated list with filters |
| GET | `/production/machines/:machineId` | Machine detail |
| GET | `/production/machines/:machineId/history` | Status, maintenance, assignments |
| POST | `/production/machines` | Create (facility inferred from department if omitted) |
| PATCH | `/production/machines/:machineId` | Update profile/capacity |
| POST | `/production/machines/:machineId/archive` | Archive |
| POST | `/production/machines/:machineId/restore` | Restore |
| PATCH | `/production/machines/:machineId/status` | Manual status change |
| POST | `/production/machines/:machineId/maintenance` | Log maintenance |

**RBAC:**

- View: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `STAFF` (with `production.machine.view` or `production.task.execute`)
- Manage: `SUPER_ADMIN`, `ADMIN`, `MANAGER` (or `production.machine.manage`)

## Assignment rules

- Machine assignment is **optional**; operator assignment remains required
- Machine must belong to the task's department
- Machine must be `isActive: true`
- Machine `operationalStatus` must be `AVAILABLE` or `RESERVED`
- On assign → `BUSY`; on unassign/complete when idle → `AVAILABLE`

## Capacity (stored, not scheduled)

The following fields are persisted for a future Planning Engine — **no scheduling logic in M7**:

- `capacityPerHour`
- `workingHours` (JSON schedule)
- `averageRuntimeMinutes`
- `supportedProductIds`
- Sheet/print dimension limits

## Production Control Center integration

Dashboard bundle (`GET /production/control-center`) now includes a `machines` object:

- `totalMachines`, `available`, `busy`, `reserved`, `maintenance`, `offline`
- `activeAssignments`, `utilizationPercent`

Machine mutations invalidate control center cache and emit `CONTROL_CENTER_UPDATED` via existing listeners.

## Events

| Event | When |
|-------|------|
| `MACHINE_CREATED` | Machine registered |
| `MACHINE_UPDATED` | Profile/capacity edited or restored |
| `MACHINE_ASSIGNED` | Linked to a production task |
| `MACHINE_STATUS_CHANGED` | Operational status changed |
| `MACHINE_ARCHIVED` | Machine deactivated |

## Performance

Designed for thousands of machines and 50k+ orders:

- Cursor pagination on list endpoints
- Redis cache for machine lists (`production-machines:` prefix, 30s TTL)
- Minimal Prisma selects (`MACHINE_LIST_SELECT`, `MACHINE_DETAIL_SELECT`)
- Overview via `groupBy` on operational status
- Indexes on `department_id`, `operational_status`, `is_active`, `machine_code`

## Frontend surfaces

| Route | Audience | Purpose |
|-------|----------|---------|
| `/admin/production/machines` | Managers | List, search, filter, overview cards |
| `/admin/production/machines/new` | Managers | Create machine |
| `/admin/production/machines/:id` | Managers | Detail, history, status, maintenance |
| `/admin/production/machines/:id/edit` | Managers | Edit profile |
| Task assignment panel | Managers | Optional machine picker |
| `/admin/production/my-tasks` | Operators | Machine on assigned task cards |
| Task workspace | Operators | Assigned machine details |
| Control Center | Managers | Machine fleet widget |

## Future IoT compatibility

When IoT arrives (later milestone):

- Telemetry can write to `metadata` or a dedicated telemetry table keyed by `machineId`
- Automated status updates can call the same `changeOperationalStatus` path
- External device IDs map via `metadata.externalDeviceId` without schema migration
- Status history provides a full audit trail for automated vs manual changes

## Explicitly out of scope (M7)

- Machine scheduling / automatic planning
- IoT APIs, telemetry, barcode scanning
- Predictive maintenance algorithms

## Seed data

`production-machines.seed.ts` creates sample PRINT department machines (offset, digital, large format) linked to `GEETA-MAIN` facility.

## Verification

```bash
cd backend
npm run test:machines
npm run test:control-center
npm run test:assignment
```

Success criteria:

- Production Manager can CRUD machines, change status, view history
- Assignment panel supports optional machine selection
- Operators see assigned machine on their tasks
- Control Center shows machine fleet overview
- Capacity fields stored for future planning engine consumption

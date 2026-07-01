# Milestone 5 — Quality Control Engine

Implementation reference for the Geeta Print production ERP Quality Control (QC) module.

## Architecture principle

**QC never advances workflows directly.** The QC Engine only records inspection outcomes. The Workflow Engine remains the single source of truth for task progression, rework routing, and dependency resolution.

```
Production task completed
        ↓
Workflow Engine (advance → resolve dependencies)
        ↓
QC task becomes READY
        ↓
Inspector starts inspection (QC module)
        ↓
Checklist · Defects · Notes · Attachments
        ↓
Submit PASS / FAIL / HOLD / REWORK
        ↓
workflowEngine.processQcOutcome()
        ↓
Workflow Engine decides next state OR rework
```

## QC lifecycle

| Phase | Status | Actor | Outcome |
|-------|--------|-------|---------|
| Task ready | Workflow task `READY` / `ASSIGNED` | Assignment Engine | Inspector assigned |
| Start | `QualityInspectionStatus.IN_PROGRESS` | QC Service | Checklist instantiated from template |
| Inspect | IN_PROGRESS | Inspector | Items, defects, notes, attachments |
| Submit | `QualityInspectionStatus.COMPLETED` | QC Service | Result stored; workflow callback invoked |
| Workflow | Task terminal / hold / rework | Workflow Engine | Downstream tasks updated per template |

## Inspection flow

### Start inspection

`POST /api/v1/production/tasks/:taskId/inspection/start`

- Validates task is `QUALITY_CHECK` step type
- Moves task to `IN_PROGRESS` if not already
- Resolves checklist template (explicit ID → workflow step → product version)
- Creates `QualityInspection` + `QualityInspectionItem` rows
- Records timeline `QC_STARTED` and emits `QC_STARTED`

### Checklist

Templates are stored in `QualityChecklistTemplate` / `QualityChecklistTemplateItem`.

Resolution order:

1. Explicit `checklistTemplateId` in start request
2. Active template linked to `workflowTemplateStepId`
3. Active template linked to `productOfferingVersionId`

Default seed template: `QC-STANDARD-CHECKLIST` with 11 standard items (color, registration, alignment, etc.).

`PATCH /api/v1/production/inspections/:inspectionId/checklist` updates item pass/fail and remarks.

### Defects

`POST /api/v1/production/inspections/:inspectionId/defects`

Stores category, severity (`LOW`–`CRITICAL`), description, optional image (`FileAsset`), remarks, timestamp.

### Attachments

Reuses Cloudflare R2 via `storageService.createPresignedProductionAttachmentUpload`.

Categories: `PHOTO`, `PDF`, `REPORT`, `ANNOTATED_ARTWORK`.

Flow: presign → client upload → register attachment on inspection.

### Submit result

`POST /api/v1/production/inspections/:inspectionId/submit`

Supported results:

| Result | Workflow action |
|--------|-----------------|
| `PASS` | `advance({ action: 'complete' })` |
| `PASS_WITH_REMARKS` | Same as PASS |
| `ON_HOLD` | QC task → `ON_HOLD`; no dependency resolution |
| `FAIL` | Rework path (see below) |
| `REWORK_REQUIRED` | Rework path |

## Rework strategy

Rework is **not hardcoded to Printing**. Target resolution in `WorkflowEngine.resolveReworkTargetTaskId`:

1. Explicit `targetTaskId` in submit body (manager override)
2. `workflowTemplateStep.metadata.reworkTargetStepCode` on the QC step
3. Last `COMPLETED` predecessor before QC
4. Highest `stepOrder` predecessor

On fail/rework:

- QC task → `BLOCKED`
- Target task → `REWORK` (clears `completedAt`)
- Downstream tasks → `BLOCKED` (completed downstream reset)
- `ReworkRequest` created with incrementing `reworkCycle`
- Inspection linked via `qcInspectionId`
- Timeline: `QC_FAILED`, `WORKFLOW_REWORKED`

Seed default: QC step metadata `{ reworkTargetStepCode: "PRINTING" }`.

## Workflow integration

Entry point: `WorkflowEngine.processQcOutcome(input)`.

```typescript
// QC Service — submitResult (simplified)
const outcome = await workflowEngine.processQcOutcome({
  workflowInstanceId,
  qcTaskId,
  result: body.result,
  actorId,
  remarks: body.remarks,
  targetTaskId: body.targetTaskId,
});
```

Execution Engine blocks `QUALITY_CHECK` tasks — operators must use the QC module (`assertNotQcExecutionTask`).

## Events

| Event | When |
|-------|------|
| `QC_STARTED` | Inspection started |
| `QC_PASSED` | Pass / pass with remarks |
| `QC_FAILED` | Fail / rework |
| `QC_HOLD` | On hold |
| `REWORK_REQUESTED` | Rework required |
| `QC_NOTE_ADDED` | QC note saved |
| `QC_ATTACHMENT_ADDED` | QC attachment registered |

Production queue Redis cache invalidates on all QC events.

## Timeline events

- `QC_STARTED`, `QC_PASSED`, `QC_FAILED`, `QC_HOLD`
- `QC_ATTACHMENT_ADDED`, `WORKFLOW_REWORKED`

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/production/metrics` | Manager QC metrics |
| GET | `/production/departments/:departmentId/qc-queue` | Pending QC tasks |
| GET | `/production/tasks/:taskId/inspection` | Current / latest inspection |
| POST | `/production/tasks/:taskId/inspection/start` | Start inspection |
| PATCH | `/production/inspections/:id/checklist` | Update checklist |
| POST | `/production/inspections/:id/defects` | Add defect |
| POST | `/production/inspections/:id/notes` | Add QC note |
| POST | `/production/inspections/:id/attachments/presign` | R2 presign |
| POST | `/production/inspections/:id/attachments` | Register attachment |
| POST | `/production/inspections/:id/submit` | Submit result → workflow |

## Permissions

| Permission | Purpose |
|------------|---------|
| `production.qc.inspect` | Staff QC inspection |
| `production.qc.view.all` | Cross-department QC metrics |

Managers/admins have implicit access.

## Frontend

| Route | Purpose |
|-------|---------|
| `/admin/production/qc/[taskId]` | Inspector QC workspace |
| `/admin/production/qc/metrics` | Manager metrics dashboard |

My assigned tasks routes `QUALITY_CHECK` assignments to the QC workspace.

## Performance

Designed for 50,000+ orders:

- Indexed foreign keys on inspections, defects, attachments, checklist templates
- Scoped Prisma selects (`INSPECTION_SELECT`, `QC_TASK_SELECT`)
- Parallel metric aggregation via `Promise.all`
- Redis queue cache invalidation on QC mutations
- Transactions for start/submit/attachment flows

## Data model (new)

- `QualityChecklistTemplate` / `QualityChecklistTemplateItem`
- `QualityInspection` / `QualityInspectionItem`
- `QualityInspectionDefect` / `QualityInspectionAttachment`
- Extended `ReworkRequest`: `targetTaskId`, `qcInspectionId`, `reworkCycle`

Migration: `20260628120000_quality_control_engine_m5`

## Testing

```bash
npm run test:qc
```

Covers access control, validation schemas, and workflow callback result mapping.

## Seed

```bash
npm run seed:master
```

Seeds:

- QC step rework metadata on standard workflow template
- `QC-STANDARD-CHECKLIST` template linked to QC workflow step
- Staff role `production.qc.inspect` permission

## Out of scope (later milestones)

Machine Registry, Production Dashboard, Planning Board, Inventory, Dispatch, Reports, Analytics, Vendor Live Tracking.

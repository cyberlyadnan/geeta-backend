# ERP Master Data Guide — Geeta Print Production System

A complete guide to how production master data, workflows, and orders work in the Geeta Print ERP.

**Audience:** Developers, QA, and production managers new to the system.  
**Prerequisite:** Run `npm run seed` in `backend/` before exploring the admin UI.

---

## Table of contents

1. [System overview](#1-system-overview)
2. [What is a workflow template?](#2-what-is-a-workflow-template)
3. [What is a workflow instance?](#3-what-is-a-workflow-instance)
4. [What is a workflow step?](#4-what-is-a-workflow-step)
5. [What is a department?](#5-what-is-a-department)
6. [Product ↔ workflow linking](#6-product--workflow-linking)
7. [Order → workflow task generation](#7-order--workflow-task-generation)
8. [Assignment engine](#8-assignment-engine)
9. [Quality control in the workflow](#9-quality-control-in-the-workflow)
10. [Machines in the workflow](#10-machines-in-the-workflow)
11. [Order journey through departments](#11-order-journey-through-departments)
12. [Rework cycles](#12-rework-cycles)
13. [Admin: create workflows](#13-admin-create-workflows)
14. [Admin: create departments](#14-admin-create-departments)
15. [Admin: create products](#15-admin-create-products)
16. [Admin: connect products to workflows](#16-admin-connect-products-to-workflows)
17. [Database tables & relationships](#17-database-tables--relationships)
18. [Services & data creation](#18-services--data-creation)
19. [Complete order lifecycle](#19-complete-order-lifecycle)
20. [Test credentials](#20-test-credentials)

---

## 1. System overview

```
Vendor places order
        ↓
ProductionOrder + ProductionOrderItem (pricing snapshot)
        ↓
WorkflowEngine.createForProductionOrder()
        ↓
WorkflowInstance + WorkflowTasks (one per template step)
        ↓
Department queues → Assignment → Execution → QC → Packing → Dispatch
        ↓
ProductionOrder status updates + timeline + activity log
```

**Key principle:** Business logic lives in engines (Workflow, Assignment, Execution, QC). Master data (templates, departments, machines) configures behavior — it does not duplicate logic.

---

## 2. What is a workflow template?

A **workflow template** is a reusable blueprint for production routing.

| Field | Example |
|-------|---------|
| `code` | `WF-DIGITAL` |
| `name` | Digital Print Workflow |
| `facilityId` | GEETA-MAIN |
| `isDefault` | false |

**Seeded templates:**

| Code | Use case |
|------|----------|
| `WF-STANDARD-PRODUCTION` | Default fallback |
| `WF-DIGITAL` | Visiting cards, flyers |
| `WF-OFFSET` | Booklets, catalogues |
| `WF-UV` | Acrylic, spot UV |
| `WF-FOILING` | Foil cards |
| `WF-LAMINATION` | Laminated print |
| `WF-FLEX` | Flex banners |
| `WF-LARGE_FORMAT` | Vinyl, canvas, boards |
| `WF-DIE_CUT` | Packaging, cartons |

**Table:** `workflow_templates`

---

## 3. What is a workflow instance?

A **workflow instance** is a **running copy** of a template for one order item.

```
WF-DIGITAL (template)
        ↓ instantiated when order is placed
WorkflowInstance #abc123 (order GP-SEED-000001)
```

| Field | Meaning |
|-------|---------|
| `orderId` | Parent production order |
| `productionOrderItemId` | One item → one instance |
| `workflowTemplateId` | Which blueprint was used |
| `status` | INITIALIZED → RUNNING → COMPLETED |
| `currentStepOrder` | Active step in the pipeline |

**Table:** `workflow_instances`  
**Created by:** `WorkflowEngine.createForProductionOrder()`

---

## 4. What is a workflow step?

A **workflow step** (template step) defines one station in the pipeline.

Example from `WF-DIGITAL`:

```
Step 1  ARTWORK_VERIFICATION   → Artwork dept
Step 2  DIGITAL_PRINTING       → Digital Printing dept
Step 3  CUTTING                → Cutting dept
Step 4  QUALITY_CHECK          → QC dept (rework → DIGITAL_PRINTING)
Step 5  PACKING                 → Packing dept
Step 6  DISPATCH                → Dispatch dept
```

| Field | Purpose |
|-------|---------|
| `stepCode` | Stable identifier (e.g. `QUALITY_CHECK`) |
| `stepType` | VERIFICATION, PRINTING, QUALITY_CHECK, … |
| `departmentId` | Which queue receives tasks |
| `expectedMinutes` | Planning / SLA baseline |
| `metadata.reworkTargetStepCode` | Where QC failures route |

**Tables:** `workflow_template_steps`, `workflow_template_step_dependencies`, `workflow_sla_policies`

---

## 5. What is a department?

A **department** is a production unit with its own queue and operators.

**Seeded departments (14):**

```
PRODUCTION_PLANNING → ARTWORK → DIGITAL_PRINT / OFFSET_PRINT / UV_PRINT
    → FOILING / EMBOSSING / LAMINATION / CUTTING / BINDING
    → QC → PACKING → DISPATCH → CUSTOMER_SUPPORT
```

| Field | Example |
|-------|---------|
| `code` | `DIGITAL_PRINT` |
| `name` | Digital Printing |
| `sortOrder` | Queue display order |
| `description` | Includes UI color hint |

**Operators** are linked via `user_department_assignments` (OPERATOR or SUPERVISOR).

**Permissions:** `production.queue.dept:DIGITAL_PRINT` grants queue access.

**Table:** `departments`

---

## 6. Product ↔ workflow linking

Products do not embed workflow logic. Instead:

```
ProductOfferingVersion
        ↓
ProductOfferingWorkflow (join table)
        ↓
WorkflowTemplate
```

**Seed rules** (`product-workflows.seed.ts`):

| Product pattern | Template |
|-----------------|----------|
| visiting-cards, flyers | WF-DIGITAL |
| catalogues-booklets | WF-OFFSET |
| acrylic, spot-uv | WF-UV |
| foiling category | WF-FOILING |
| flex-banners | WF-FLEX |
| vinyl, canvas | WF-LARGE_FORMAT |
| packaging | WF-DIE_CUT |
| (default) | WF-STANDARD-PRODUCTION |

**Table:** `product_offering_workflows`

---

## 7. Order → workflow task generation

When a vendor places an order:

```
OrdersService.create()
    → ProductionOrder + Item
    → WorkflowEngine.createForProductionOrder()
        → Resolve template via ProductOfferingWorkflow
        → Create WorkflowInstance
        → TaskGeneratorService.buildPayloads() → WorkflowTask rows
        → Create WorkflowTaskDependency from template deps
        → First step(s) → READY status
```

**ASCII: task generation**

```
Template steps:  [A] → [B] → [C] → [QC] → [P] → [D]
                      ↓
Runtime tasks:   Task-A (READY)
                 Task-B (BLOCKED)
                 Task-C (BLOCKED)
                 ...
```

**Tables:** `workflow_tasks`, `workflow_task_dependencies`, `workflow_task_history`

---

## 8. Assignment engine

Managers assign **operators** (required) and **machines** (optional) to tasks.

```
WorkflowTask (READY)
        ↓ AssignmentService.assign()
WorkflowTaskAssignment (ACTIVE)
        ↓
WorkflowTask → ASSIGNED
Machine → BUSY (if machineId set)
```

**Reassign / unassign** supersede the active assignment and write `workflow_task_assignment_history`.

**Test users:**

| Email | Department |
|-------|------------|
| `digital@geetaprint.com` | Digital Printing |
| `qc@geetaprint.com` | QC |
| `packing@geetaprint.com` | Packing |

---

## 9. Quality control in the workflow

QC is a **workflow step** (`stepType: QUALITY_CHECK`), not a separate system.

```
QC task becomes READY
        ↓
QC Inspector opens QC workspace
        ↓
QualityInspection created from QualityChecklistTemplate
        ↓
PASS → advance workflow
FAIL → rework target step (from metadata)
```

**Per-workflow checklists** (seeded): `QC-DIGITAL`, `QC-OFFSET`, `QC-UV`, etc.

**Tables:** `quality_checklist_templates`, `quality_checklist_template_items`, `quality_inspections`

---

## 10. Machines in the workflow

Machines are optional on assignment.

```
Machine (DIG-001 HP Indigo 7900)
    departmentId → DIGITAL_PRINT
    operationalStatus → AVAILABLE | BUSY | MAINTENANCE
        ↓
WorkflowTaskAssignment.machineId
        ↓
WorkflowTask.assignedMachineId
```

**Seeded machines:** HP Indigo 7900, Konica AccurioPress, Canon imagePRESS, Komori Lithrone, Roland VersaUV, Mimaki UCJV, etc.

**Table:** `machines`

---

## 11. Order journey through departments

**Example: Gold foil visiting card (`WF-FOILING`)**

```
┌─────────────┐
│   ARTWORK   │  artwork@geetaprint.com verifies files
└──────┬──────┘
       ▼
┌─────────────┐
│   DIGITAL   │  digital@geetaprint.com on HP Indigo
└──────┬──────┘
       ▼
┌─────────────┐
│   FOILING   │  foiling@geetaprint.com
└──────┬──────┘
       ▼
┌─────────────┐
│     QC      │  qc@geetaprint.com
└──────┬──────┘
       ▼
┌─────────────┐
│   PACKING   │  packing@geetaprint.com
└──────┬──────┘
       ▼
┌─────────────┐
│  DISPATCH   │  dispatch@geetaprint.com
└─────────────┘
```

---

## 12. Rework cycles

When QC fails:

1. `WorkflowEngine.processQcOutcome()` with `FAIL` or `REWORK_REQUIRED`
2. Target task (from `metadata.reworkTargetStepCode`) → `REWORK` status
3. `ReworkRequest` record created
4. Operator re-executes production step
5. QC runs again

**Seed example:** `GP-SEED-000006` (Gold Foil Cards) — print task in `REWORK`.

---

## 13. Admin: create workflows

1. Create departments first (if new station needed)
2. Create `WorkflowTemplate` with unique `code`
3. Add `WorkflowTemplateStep` rows in sequence
4. Add `WorkflowTemplateStepDependency` (or rely on linear order)
5. Add `WorkflowSlaPolicy` per step (optional)
6. Add `QualityChecklistTemplate` on QC step
7. Link products via `ProductOfferingWorkflow`

**API:** `/workflow` admin routes (existing milestone).

---

## 14. Admin: create departments

1. Assign to `facilityId`
2. Set unique `code` (used in permissions: `production.queue.dept:CODE`)
3. Set `sortOrder` for UI
4. Assign staff via `UserDepartmentAssignment`

---

## 15. Admin: create products

Products are created via Product Engine (catalog seed or admin UI):

```
Category → Family → Series → ProductOffering → ProductOfferingVersion
    → ProductPrintConfig, pricing, file requirements
```

Publish version (`isCurrent: true`, `status: ACTIVE`) before linking workflow.

---

## 16. Admin: connect products to workflows

**Option A — Seed rules:** extend `PRODUCT_WORKFLOW_RULES` in `product-workflows.seed.ts`

**Option B — Direct DB/API:**

```sql
INSERT INTO product_offering_workflows (product_offering_version_id, workflow_template_id)
VALUES ('version_id', 'template_id');
```

**Option C — Admin UI** (when exposed): product version settings → workflow template picker.

---

## 17. Database tables & relationships

```
facilities
    └── departments
            ├── workflow_template_steps
            ├── workflow_tasks
            ├── machines
            └── user_department_assignments

workflow_templates
    ├── workflow_template_steps
    │       ├── workflow_sla_policies
    │       ├── quality_checklist_templates
    │       └── workflow_template_step_dependencies
    └── product_offering_workflows

production_orders
    ├── production_order_items
    │       └── workflow_instances
    │               └── workflow_tasks
    │                       ├── workflow_task_assignments
    │                       ├── quality_inspections
    │                       └── workflow_task_execution_sessions
    └── production_order_events
```

---

## 18. Services & data creation

| Data | Created by |
|------|------------|
| Master templates, departments | Seed / admin CRUD |
| Product catalog | Seed / Product Engine |
| Product–workflow link | Seed / admin |
| Production order | `OrdersService` (vendor API) |
| Workflow instance & tasks | `WorkflowEngine` |
| Task assignment | `AssignmentService` |
| Production execution | `ExecutionService` |
| QC inspection | `QcService` |
| Timeline events | `WorkflowTimelineService` |
| Activity log | `ActivityLogService` |
| Machine status | `MachineService` |

---

## 19. Complete order lifecycle

```
ORDER_CREATED          Vendor submits order, wallet debited
        ↓
UNDER_ARTWORK_REVIEW   (if artwork uploaded)
        ↓
ARTWORK_APPROVED       Artwork operator approves
        ↓
IN_PRODUCTION          Print/finish tasks executing
        ↓
QUALITY_CHECK          QC inspection in progress
        ↓
READY_FOR_DISPATCH     Packed, awaiting dispatch
        ↓
DISPATCHED             Handed to courier
        ↓
DELIVERED              Confirmed delivery
```

**Parallel:** `WorkflowInstance.status` tracks template execution; `ProductionOrder.status` tracks business state.

**Seed orders** cover each stage — see `orders.seed.ts` (`GP-SEED-000001` … `GP-SEED-000010`).

---

## 20. Test credentials

Default password for all seeded test users: **`Geeta@12345`**  
(Override via `SEED_TEST_USER_PASSWORD` env var.)

| Email | Role | Purpose |
|-------|------|---------|
| `admin@geetaprint.com` | Super Admin | Full access (`Admin@12345`) |
| `production.manager@geetaprint.com` | Manager | Production control, assign tasks |
| `dept.manager@geetaprint.com` | Manager | Digital + QC supervisor |
| `artwork@geetaprint.com` | Staff | Artwork operator |
| `digital@geetaprint.com` | Staff | Digital press operator |
| `offset@geetaprint.com` | Staff | Offset operator |
| `uv@geetaprint.com` | Staff | UV operator |
| `foiling@geetaprint.com` | Staff | Foiling operator |
| `lamination@geetaprint.com` | Staff | Lamination operator |
| `cutting@geetaprint.com` | Staff | Cutting operator |
| `binding@geetaprint.com` | Staff | Binding operator |
| `qc@geetaprint.com` | Staff | QC inspector |
| `packing@geetaprint.com` | Staff | Packing |
| `dispatch@geetaprint.com` | Staff | Dispatch |
| `support@geetaprint.com` | Staff | Customer support |
| `vendor@geetaprint.com` | Vendor | Place orders (wallet ₹5,00,000) |

---

## Quick start

```bash
cd backend
npm run seed
npm run dev
```

Open:

- http://localhost:3000/admin/production/orders — seed orders
- http://localhost:3000/admin/production/queues — department queues
- http://localhost:3000/admin/production/control-center — dashboards

Login as `production.manager@geetaprint.com` / `Geeta@12345` to explore the full production flow.

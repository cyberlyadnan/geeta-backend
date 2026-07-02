# Master Data Audit — Geeta Print ERP

Audit date: July 2026  
Scope: Production ERP master data required for end-to-end testing (Milestones M1–M8)

---

## Executive summary

Before this audit, the seed pipeline provided a **minimal production skeleton** (5 departments, 1 workflow template, 1 QC checklist, 3 machines, 2 users, 0 test orders). Product–workflow links often failed on fresh installs because workflow linking ran **before** the product catalog.

This audit documents gaps and the **fixes applied** so `npm run seed` configures a fully testable ERP.

---

## What existed (before fix)

| Area | Status | Details |
|------|--------|---------|
| Print masters | ✅ Complete | Units, sheet sizes, processes, categories, 100+ products |
| Facility | ✅ Partial | `GEETA-MAIN` only |
| Departments | ⚠️ Partial | 5 depts: ARTWORK, PRINT, QC, PACKING, DISPATCH |
| Workflow templates | ⚠️ Partial | `WF-STANDARD-PRODUCTION` only (5 steps) |
| Product → workflow links | ❌ Broken on fresh seed | Ran before products; 0 links typical |
| QC templates | ⚠️ Partial | 1 generic checklist on standard workflow |
| Machines | ⚠️ Partial | 3 sample machines under legacy `PRINT` dept |
| Roles | ✅ Enum-level | 6 system roles; generic permission sets |
| Test users | ⚠️ Partial | Super admin + 1 generic operator |
| Test orders | ❌ Missing | No `ProductionOrder` / workflow instances seeded |
| SLA policies | ❌ Missing | Schema supported; not seeded |
| Step dependencies | ❌ Missing | Linear deps not created in old seed |

---

## What was missing

### Departments (required: 14)

Missing process-specific departments:

- DIGITAL_PRINT, OFFSET_PRINT, UV_PRINT, FOILING, EMBOSSING, LAMINATION, CUTTING, BINDING
- PRODUCTION_PLANNING, CUSTOMER_SUPPORT

Legacy `PRINT` department was too generic for queue routing and machine assignment.

### Workflow templates (required: 9)

Only `WF-STANDARD-PRODUCTION` existed. Missing:

- WF-DIGITAL, WF-OFFSET, WF-UV, WF-FOILING, WF-LAMINATION, WF-FLEX, WF-LARGE_FORMAT, WF-DIE_CUT

### Product linking

No per-product routing (visiting cards → digital, booklets → offset, flex → large format, packaging → die cut).

### QC

Single checklist for all products. No per-workflow inspection templates.

### Machines

Missing requested enterprise machines (Konica, Komori, Roland UV, Mimaki, Canon). Machines not mapped to process departments.

### Users & roles

No production manager, department manager, per-department operators, QC inspector, packing/dispatch staff, or vendor test account with wallet.

### Test orders

No orders in states needed for dashboard testing: in production, QC, packing, dispatch, rework, rush, delayed, on hold, completed.

### Seed orchestration

Phase order bug: `seedProductionWorkflow()` ran in `master` phase before `seedProducts()`, so `ProductOfferingWorkflow` rows were not created on fresh databases.

---

## What was fixed

### New seed modules (`backend/prisma/seed/master/`)

| File | Purpose |
|------|---------|
| `production.constants.ts` | Department defs, 9 workflow templates, shared constants |
| `departments.seed.ts` | 14 departments + facility |
| `workflow-templates.seed.ts` | All templates, steps, SLA, linear dependencies |
| `machines.seed.ts` | 9 enterprise machines mapped to departments |
| `qc.seed.ts` | 9 per-workflow QC checklist templates |
| `permissions.seed.ts` | Role permissions incl. all `production.queue.dept:*` scopes |
| `users.seed.ts` | 15 test users (managers, operators, vendor + wallet) |
| `product-workflows.seed.ts` | Product version → workflow routing (runs after products) |
| `orders.seed.ts` | 10 test production orders with workflow scenarios |

Legacy files (`production-workflow.seed.ts`, etc.) remain as thin re-exports for backward compatibility.

### Orchestrator changes (`prisma/seed/index.ts`)

```
1. roles + permissions + super admin
2. master (print config + production ERP master)
3. products (catalog)
4. product → workflow links
5. test production orders
```

New scope: `npm run seed:orders` (links + orders; requires existing masters).

### Registry extension (`core/types.ts`)

`MasterRegistry` now tracks `facilityId`, `departments`, `workflowTemplates` for cross-phase linking.

---

## Current state (after fix)

| Area | Count | Notes |
|------|-------|-------|
| Departments | 14 | Full shop-floor coverage |
| Workflow templates | 9 | With steps, SLA, dependencies |
| QC templates | 9 | One per workflow |
| Machines | 9 | HP Indigo, Konica, Canon, Komori, Roland, Mimaki, etc. |
| Test users | 16 | incl. super admin + vendor |
| Product workflow links | ~100+ | Rule-based after catalog seed |
| Test orders | 10 | GP-SEED-000001 … GP-SEED-000010 |

### Department color field

`departments` table has no `color` column. UI color is stored in `description` as `UI Color: #hex` for reference until a future schema addition.

### Granular roles

Prisma `RoleName` enum remains 6 values (SUPER_ADMIN, ADMIN, MANAGER, STAFF, CUSTOMER, VENDOR). Enterprise personas (QC Inspector, Digital Operator) are represented as **named users** on the `STAFF` role with `UserDepartmentAssignment` scoping.

---

## Verification commands

```bash
cd backend
npm run seed              # Full ERP from scratch
npm run seed:master       # Production master only
npm run seed:orders       # Products + links + test orders
```

After seeding, verify:

1. `/admin/production/queues` — all departments visible
2. `/admin/production/orders` — 10 seed orders
3. `/admin/production/control-center` — rush, delayed, QC alerts from seed scenarios
4. Login as `production.manager@geetaprint.com` / `Geeta@12345`

---

## Remaining optional enhancements (not blocking E2E)

- Dedicated `RoleName` values for QC Inspector / Operator (schema migration)
- `departments.color` column for UI theming
- Packing/dispatch milestone modules (M9+)
- Automated QC inspection records on seed orders (runtime data; optional seed)
- Multi-facility master data

---

## Related documentation

- [ERP_MASTER_DATA_GUIDE.md](./ERP_MASTER_DATA_GUIDE.md) — how the production system works
- [IMPLEMENTATION_MILESTONE_08_PRODUCTION_ORDER_MANAGEMENT.md](./IMPLEMENTATION_MILESTONE_08_PRODUCTION_ORDER_MANAGEMENT.md)

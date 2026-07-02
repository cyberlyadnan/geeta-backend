# Milestone 9 — Production ERP Portal

Implementation reference for the standalone Production Portal at `/production` for factory `MANAGER` and `STAFF` users.

## Purpose

Provide a dedicated **Production ERP Portal** separate from the Admin ERP (`/admin`) and Vendor Portal (`/vendor`). Production staff land here after login; admins remain on `/admin`; vendors on `/vendor`.

## Portal architecture

```
Login success
    ├── SUPER_ADMIN / ADMIN  → /admin
    ├── MANAGER / STAFF      → /production
    └── VENDOR               → /vendor (canonical; /dashboard rewrites + redirects)

Production Portal (/production)
    ├── ProductionLayout (sidebar + header)
    ├── Permission-driven sidebar (production-nav-config.ts)
    ├── ProductionRouteProvider (portal-aware links in shared feature modules)
    └── Reused production feature components (queue, machines, orders, control center)
```

## Authentication flow

| Role | Default route | Middleware |
|------|---------------|------------|
| `SUPER_ADMIN` | `/admin` | Blocks `/production`, `/vendor` |
| `ADMIN` | `/admin` | Blocks `/production`, `/vendor` |
| `MANAGER` | `/production` | Blocks `/admin`; allows `/production` |
| `STAFF` | `/production` | Blocks `/admin`; allows `/production` |
| `VENDOR` | `/vendor` | `/vendor/*` rewrites to `/dashboard/*`; legacy `/dashboard` redirects to `/vendor` |
| `CUSTOMER` | `/customer` | — |

**Session:** Backend `/auth/login` and `/auth/me` return `permissions: string[]` on the user object. Frontend stores permissions on `User` in Zustand + hydrates via `AuthProvider`.

## Authorization flow

1. **Route middleware** — role-based portal separation (`frontend/src/middleware.ts`).
2. **Sidebar** — `getVisibleProductionNavGroups(user)` filters nav items using `frontend/src/lib/permissions.ts`.
3. **API** — existing production module permission helpers; control-center routes relaxed to include `STAFF` (service layer still enforces `canViewControlCenter`).

### Permission helpers (frontend)

- `hasPermission`, `hasAnyPermission`, `hasAllPermissions`
- `canViewProductionControl`, `canViewProductionQueues`, `canViewMyTasks`
- `canViewProductionMachines`, `canManageProductionMachines`
- `canViewProductionQc`, `canViewProductionOrders`, `canAssignProductionTasks`

Constants mirror backend `PERMISSIONS` under `PRODUCTION_PERMISSIONS` in `frontend/src/lib/permissions.ts`.

## Role matrix

| Capability | SUPER_ADMIN | ADMIN | MANAGER | STAFF |
|------------|-------------|-------|---------|-------|
| Admin ERP | ✓ | ✓ | — | — |
| Production Portal | — (redirect) | — | ✓ | ✓ |
| Control center dashboard | via admin | via admin | via `/production` if permitted | if `production.control.view` |
| Department queues | admin routes | admin routes | permission-driven | dept-scoped permissions |
| My tasks | admin routes | admin routes | ✓ | ✓ |
| Machine registry view | ✓ | ✓ | permission | permission |
| Machine manage | ✓ | ✓ | permission | typically denied |

## Sidebar generation

Defined in `frontend/src/components/layouts/production/production-nav-config.ts`:

| Nav item | Permission predicate |
|----------|---------------------|
| Dashboard | always |
| My Tasks | `production.task.view.own` / execute |
| Department Queue | queue view / view.all / `production.queue.dept:*` |
| Machines | `production.machine.view` |
| QC | `production.qc.inspect` / view.all |
| Production Orders | `production.order.view` |
| Timeline | control-center view permission |
| Notifications | always (placeholder) |
| Profile | always |

## Dashboard logic

`/production` (`ProductionDashboardPage`):

- Users with **control-center permission** → full `ProductionControlCenterPage` (reused widget bundle).
- Other users → operator dashboard with permission-gated widgets (my tasks count, QC pending, queue shortcut).

## Navigation structure

| Route | Feature module |
|-------|----------------|
| `/production` | Dashboard / control center |
| `/production/tasks` | My assigned tasks |
| `/production/tasks/[taskId]` | Operator task workspace |
| `/production/queues` | Department queues |
| `/production/queues/[departmentId]` | Department queue |
| `/production/queues/[departmentId]/[taskId]` | Task detail |
| `/production/queues/[departmentId]/execution` | Live execution |
| `/production/qc` | QC metrics |
| `/production/qc/[taskId]` | QC inspection workspace |
| `/production/machines` | Machine registry |
| `/production/machines/[machineId]` | Machine detail |
| `/production/machines/new` | Create machine |
| `/production/machines/[machineId]/edit` | Edit machine |
| `/production/orders` | Production orders list |
| `/production/orders/[orderId]` | Order detail |
| `/production/timeline` | Live timeline feed |
| `/production/notifications` | Placeholder |
| `/production/profile` | Profile + shift placeholders |

Admin production routes under `/admin/production/*` remain unchanged for SUPER_ADMIN/ADMIN oversight.

## Shared feature modules & route context

Production feature components use `useProductionRoutes()` from `frontend/src/lib/production-route-context.tsx`:

- **Admin context** (default) → `/admin/production/*` links
- **Production portal** → `/production/*` links

This avoids duplicating queue, machine, order, and control-center UIs.

## Backend changes

- `SafeAuthUserDto` / `mapUserSessionToAuthDto` — includes `permissions` from role.
- `control-center.routes.ts` — `authorize(...productionRoles)` includes `STAFF`; controllers/services enforce fine-grained permissions.

## Vendor canonical URL

- `APP_ROUTES.VENDOR.*` paths use `/vendor` prefix.
- Middleware **rewrites** `/vendor/*` → `/dashboard/*` (existing page tree).
- Vendors hitting `/dashboard/*` are **redirected** to `/vendor/*`.

## Future extension points

- Real-time production notification center
- Department-specific dashboard layouts
- Operator / QC / packing specialized home screens
- Shift handoff and escalation inboxes
- Self-service password change on production profile
- Hide admin-only quick actions (workflow designer) when rendered inside production portal

## Key files

| Area | Path |
|------|------|
| Routes | `frontend/src/constants/routes.ts` |
| Roles / redirects | `frontend/src/constants/roles.ts` |
| Middleware | `frontend/src/middleware.ts` |
| Permissions | `frontend/src/lib/permissions.ts` |
| Layout | `frontend/src/layouts/production-layout.tsx` |
| Nav config | `frontend/src/components/layouts/production/production-nav-config.ts` |
| Route group | `frontend/src/app/(production)/production/**` |
| Auth permissions | `backend/src/common/security/user.serialization.ts` |

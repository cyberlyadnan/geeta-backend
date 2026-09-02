# Delivery Department — Setup & Operations Guide

A simple guide for Geeta Printers staff: how delivery works in the system, how to set it up from scratch, and how to run it day to day.

This is **not** the same as:

| Screen | What it is |
|--------|------------|
| **Admin → Settings → Delivery** | Platform delivery **charges** and pickup options (how much delivery costs on an order). |
| **Admin → Operations → Delivery shifts** | **Dispatch windows** (morning / evening cutoff times for batching). |
| **Admin → Delivery** (this module) | Who **physically carries** goods after dispatch — services, delivery people, consignments. |

---

## 1. The idea in one minute

After goods leave the dispatch counter, someone still has to carry them to the vendor’s shop. This module tracks that journey.

**The routing rule is simple:**

1. Each **vendor** is tagged with a **delivery service** (e.g. “Local van”, “Bus to Saharanpur”, “Blue Dart”).
2. When a **dispatch batch** is marked **Dispatched**, the system creates one **consignment** for that batch and routes it to that vendor’s service.
3. **Delivery people** are tagged with the same services. They only see consignments for services on their list.
4. A delivery person **takes** a job from the pool, **collects** goods, **drives**, and marks **delivered** (or **failed**) on their phone.

No question is asked to the vendor at order time. No dispatcher picks a carrier in the normal case — the vendor tag decides.

```
Order → Production → Dispatch batch → [Dispatched] → Consignment → Delivery person → Vendor shop
```

---

## 2. Main pieces (vocabulary)

| Term | What it means |
|------|----------------|
| **Delivery service** | A way goods travel: local van, bus, courier, etc. You create these in the **service master**. |
| **Vendor tag** | Which service(s) a vendor uses; **one is the default** and that default is used for every consignment. |
| **Delivery person** | A user with role **DELIVERY** (your “delivery boy”). They do **not** use production departments. |
| **Service tag (on a person)** | Which services that person can carry. This is their **only** permission in delivery. |
| **Dispatch batch** | One vendor + one shift + one day — what dispatch bills and releases together. |
| **Consignment** | One batch on the road = one row on the delivery board = one job in the delivery app. |
| **Unrouted tray** | Batches dispatched but with **no service** (vendor not tagged, etc.). Admin fixes in one click. |

---

## 3. Roles — what each person can do

| Role | Delivery access |
|------|-----------------|
| **SUPER_ADMIN / ADMIN** | Full: create services, tag people, board, assign, reroute, cancel. |
| **MANAGER** | Board, view consignments, assign/reroute/cancel, tag vendors; **cannot** create/edit service master (ADMIN only). |
| **DELIVERY** | **Only** the mobile delivery app (`/delivery`). Sees consignments for **their tagged services**. |
| **STAFF** | No delivery portal (they use production queues). |

**Important:** A delivery person is **not** set up under **Departments** (Design, Dispatch, etc.). Departments are for shop-floor **STAFF**. Delivery uses:

- Role = **DELIVERY**
- Tags on **Admin → Delivery → People** (which services they handle)

---

## 4. First-time setup (do this before the next dispatch)

### Step 0 — Database

On the server (or locally), migrations must be applied:

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
```

You need migrations through `delivery_department` (tables: `delivery_services`, `vendor_delivery_services`, `delivery_agent_services`, `delivery_assignments`, `delivery_attempts`).

### Step 1 — Create delivery services

**Where:** Admin → **Delivery** → **Delivery services**  
**URL:** `/admin/delivery/services`

1. Click **New service**.
2. Fill in:
   - **Code** — short stable ID (e.g. `LOCAL`, `BUS`, `COURIER-BD`). **Cannot be changed later.**
   - **Name** — display name (e.g. “Local delivery”).
   - **Kind** — Local, Bus, Courier, etc. (for icons/grouping).
   - **Colour** — chip colour on the board.
   - **Requires tracking number** — turn on for courier/bus if you need a **docket number at pickup**.
   - **SLA hours** — optional promised delivery time from dispatch (used for “late” on the board).
   - **Active** — off = no new routing to this service.

Create at least **one** service before dispatching. If you dispatch with zero services, everything goes to the unrouted tray.

**Health check on each service card:**

- **Vendors tagged** — how many shops use this service.
- **People tagged** — how many delivery staff can carry it.
- **Red warning** — vendors tagged but **no people** → consignments will pile up with nobody to see them.

### Step 2 — Create delivery people (“delivery boys”)

**Where:** Admin → **System** → **Users** → **Create user**  
**URL:** `/admin/system/users`

1. Create a user with role **Delivery** (not Staff).
2. Set name, phone, email, password.
3. **Do not** assign production departments — not required for delivery.
4. Activate the account.

Repeat for each delivery person.

### Step 3 — Tag delivery people with services

**Where:** Admin → **Delivery** → **Delivery people**  
**URL:** `/admin/delivery/people`

1. Find the person.
2. Click **Change services** (or edit in place).
3. Tick every service they handle (e.g. local van only, or bus + local).
4. **Save**.

Until this is done, they can log in to `/delivery` but the queue will be **empty**.

### Step 4 — Tag vendors with a default service

**Where:** Admin → **Vendor onboarding** → open vendor → **Delivery services** card (next to delivery preference)  
**URL:** `/admin/vendors/{id}`

1. Edit delivery services.
2. Select which services this vendor uses.
3. Click the **star** on one service = **default** (every consignment uses this unless overridden).
4. Save.

**If a vendor has no tag:** dispatch still works. The consignment appears in the **Unrouted tray** on the delivery board for manual routing.

### Step 5 — Dispatch (existing flow)

**Where:** Admin → **Dispatch board**  
**URL:** `/admin/production/dispatch`

1. Orders finish production and join a **dispatch batch** (vendor + shift + day).
2. Dispatcher enters delivery charge, bills the batch → status **READY**.
3. Dispatcher marks **Dispatched**.

At that moment the system:

- Updates orders to **DISPATCHED** / delivery status **IN_TRANSIT**.
- Creates a **consignment** routed to the vendor’s default service (or dispatcher override on the batch).
- Puts it in the service queue for delivery people (or unrouted tray if no service).

Routing **never blocks** dispatch — a bad tag is fixed on the board later, not at the counter.

---

## 5. Day-to-day — Admin / supervisor

### Delivery board

**URL:** `/admin/delivery`

- **Unrouted tray** (top) — only when something needs a service. Pick service → **Route**.
- **Metrics** — on the road, late, on-time %, average hours.
- **Filters** — status, service, person, unassigned only, overdue only, search.
- Auto-refreshes every 30 seconds.

Open a consignment for:

- **Assign** — hand to a specific delivery person (must be tagged for that service).
- **Reroute** — send this batch via a different service.
- **Cancel** — only before goods are on the road (rules below).

Sub-nav: **Board** | **Services** | **People**

### When something is “stuck”

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Consignment in **Unrouted** | Vendor not tagged, or service inactive | Tag vendor or route manually on board |
| **Unclaimed** forever | No delivery person tagged for that service | Admin → Delivery people → add service tag |
| Person sees empty app | User not tagged, or wrong role | Role = DELIVERY + service tags |
| Service shows vendors but 0 people | Missing roster setup | Tag delivery people for that service |

---

## 6. Day-to-day — Delivery person (mobile app)

**URL:** `/delivery` (mobile-first; DELIVERY role only)

### Three tabs

| Tab | Meaning |
|-----|---------|
| **My round** | Consignments already assigned to you |
| **Available** | Unclaimed jobs on **your** services |
| **Done** | Delivered today |

### One consignment screen — one main button

The app shows **the next action** only:

| Status | What the button says |
|--------|----------------------|
| Unassigned (in pool) | **Take it** |
| Assigned to you | **Mark collected** |
| Collected | **Start the round** |
| On the road | **Delivered** |
| Failed | **Try again** (goods stay with you) |

### At pickup

- If the service **requires tracking number**, the app asks for the **docket** when marking collected (courier/bus handover time).

### At delivery

- Opens a panel: **receiver name**, optional phone, optional **photo** (uploads direct to storage).
- **Failed** — pick a reason (shop closed, nobody there, wrong address, etc.). Goods stay in your van; not returned to the pool.

### Quick actions

- **Call** and **Directions** from vendor address on the consignment.

### Rules delivery people cannot break

- Cannot **release** goods back to the pool after **collected** (goods are in the van).
- Cannot cancel a consignment already **on the road**.
- Cannot act on a consignment **assigned to someone else** (only view if on their service).

---

## 7. Consignment lifecycle (state machine)

```
UNASSIGNED → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
                ↓                         ↓
         (only before pickup)         FAILED → (retry) → IN_TRANSIT
                                         ↓
                                    RETURNED
```

**Final states:** DELIVERED, RETURNED, CANCELLED (admin only, before on-road).

Vendor order **delivery status** on the portal updates from the consignment so the shop sees the same story.

---

## 8. URLs quick reference

| Who | Page | URL |
|-----|------|-----|
| Admin | Delivery board | `/admin/delivery` |
| Admin | Services master | `/admin/delivery/services` |
| Admin | Delivery people | `/admin/delivery/people` |
| Admin | Consignment detail | `/admin/delivery/{id}` |
| Admin | Create delivery user | `/admin/system/users` |
| Admin | Tag vendor | `/admin/vendors/{id}` |
| Admin | Dispatch | `/admin/production/dispatch` |
| Delivery person | Queue | `/delivery` |
| Delivery person | One job | `/delivery/{id}` |

**API (for developers):**

- Admin: `/api/v1/admin/delivery-department/*`
- Portal: `/api/v1/delivery-portal/*`
- (Different from `/api/v1/admin/delivery` = charge settings.)

---

## 9. Example setup — Geeta Printers

**Services you might create:**

| Code | Name | Kind | Tracking # | SLA |
|------|------|------|------------|-----|
| `LOCAL` | Local Saharanpur | Local | No | 4 hours |
| `BUS` | Bus parcel | Bus | Yes | 24 hours |
| `COURIER` | Courier partner | Courier | Yes | 48 hours |

**People:**

| Person | Role | Service tags |
|--------|------|----------------|
| Ramesh | DELIVERY | LOCAL |
| Suresh | DELIVERY | LOCAL, BUS |
| Bus desk | DELIVERY | BUS only |

**Vendors:**

- Shop A → default **LOCAL** → Ramesh or Suresh see it in **Available**.
- Shop B (outstation) → default **BUS** → Suresh or bus desk see it.

**Day flow:**

1. Morning: dispatch marks batches **Dispatched**.
2. Ramesh opens `/delivery` → **Available** → **Take it** → collects from factory → **Start round** → **Delivered** at shop.
3. Supervisor watches **Delivery board** for unclaimed / late.

---

## 10. Checklist before go-live

- [ ] Migrations applied (`delivery_services` tables exist)
- [ ] At least one **delivery service** created and active
- [ ] Each active vendor has a **default service** (or you accept unrouted tray work)
- [ ] Each service with vendors has at least one **tagged delivery person**
- [ ] Delivery users created with role **DELIVERY** (not Staff)
- [ ] Delivery people tagged on **Delivery → People**
- [ ] Dispatch team knows: **Dispatched** creates the consignment automatically
- [ ] Delivery staff bookmark **`/delivery`** on their phones

---

## 11. Troubleshooting

| Problem | Solution |
|---------|----------|
| Admin **Delivery** menu empty / API errors | Run `npx prisma migrate deploy` on backend DB |
| Everything in **Unrouted tray** | Create services; tag vendors; or route each batch manually |
| Delivery person: “not tagged with any service” | Admin → Delivery people → assign services |
| Person not in **Delivery people** list | User role must be **DELIVERY** (create in System → Users) |
| Cannot assign person on board | Person must be tagged for **that consignment’s service** |
| Two sidebar items highlighted | Fixed in UI — refresh frontend; longest matching route wins |
| Order shows Dispatched but no consignment | Check backend logs for routing; batch may be unrouted |

---

## 12. Technical reference (optional)

For implementation detail, state machine code, and file map, see:

- `backend/docs/IMPLEMENTATION_MILESTONE_12_DELIVERY_DEPARTMENT.md`
- Routing: `backend/src/services/delivery/delivery-routing.service.ts`
- Lifecycle: `backend/src/services/delivery/delivery-assignment.service.ts`
- Dispatch hook: `markDispatched` in `backend/src/modules/dispatch/dispatch.service.ts`

---

## Summary

1. **Create services** (how goods travel).
2. **Create users** with role **DELIVERY**.
3. **Tag people** with services (what they carry).
4. **Tag vendors** with a default service (where consignments go).
5. **Dispatch** as usual — consignments appear automatically.
6. **Delivery people** work jobs on `/delivery`.
7. **Supervisors** watch `/admin/delivery` and clear unrouted / late items.

No production department is required for delivery boys — **role + service tags** are the whole setup.

# Milestone 12 — The Delivery Department

What happens to a consignment after it is dispatched.

The dispatch pipeline already ended with a billed `DispatchBatch` marked `DISPATCHED`. From that
moment the goods were on the road and nothing in the system knew who was carrying them. This
milestone closes that gap, end to end: a service master an admin keeps, a vendor tag that decides
routing, a delivery person's own app, and a board for whoever has to answer "where is it?"

---

## The routing rule

**A vendor is tagged with the delivery service they use. Every consignment for that vendor takes
that service. The delivery people tagged with the same service are the ones who see it.**

That is the whole of it, and it is deliberately the simplest rule that could work:

- no question to the vendor at order time,
- no dispatcher decision in the normal case,
- nothing to re-route when a delivery person is away — the consignment is routed to a **service**,
  and people are tagged to the service separately.

A vendor may hold several services (local runs on weekdays, the bus on Saturdays); one is the
default and that is the one used. A dispatcher can still send one particular consignment another
way before releasing it.

### The service is never stamped early

`DispatchBatch.deliveryServiceId` means "a dispatcher overrode this one". Null means "follow the
vendor's tag", which is resolved **at dispatch**, not when the batch was opened. So a tag fixed
this morning applies to goods leaving today, and there are no stamped copies to go stale.

### Routing never blocks dispatch

`createForBatch` is called from inside `markDispatched` and is written to log rather than throw. A
batch that cannot be routed — an untagged vendor, a counter sale, a service deactivated mid-day —
lands in the delivery board's **unrouted tray**, which an admin clears in one click. A dispatch
that failed at the counter *after the goods physically left* would be far worse than a consignment
someone places by hand ten minutes later.

---

## Data model

| Model | What it is |
|---|---|
| `DeliveryService` | The master: code, name, kind, colour, SLA hours, whether it needs a docket number. Deactivated, never deleted — a service that carried something last month must still resolve on that record next year. |
| `VendorDeliveryService` | Which services a vendor uses; exactly one row carries `isDefault`. |
| `DeliveryAgentService` | Which services a delivery person handles. **This is the whole of their authorisation.** |
| `DeliveryAssignment` | One consignment on the road. Grain is the dispatch batch — one vendor, one shift, one invoice, one physical handover — so it is what a person actually carries. |
| `DeliveryAttempt` | One knock on the door. Its own row so a second try cannot erase why the first failed; that reason is exactly what a vendor rings up to ask about. |

`RoleName` gained `DELIVERY` (hierarchy 30 — below STAFF, because a delivery person's reach is
narrower than a shop-floor operator's, not wider). `ProductionOrder.deliveryStatus` follows the
consignment via `syncOrderDeliveryStatus`, so a vendor's own order page tells the same story.

---

## The delivery person's app

`/delivery`, mobile-first, teal. Three tabs — **My round**, **Available**, **Done** — because that
is how the day divides. My round leads, since an agent opens the app far more often to work what
they already have than to look for more.

One consignment fills a screen, built around a **single primary button that says the one thing it
needs next**: take it → mark collected → start the round → delivered. Nobody should have to work
out which of six buttons applies to them; the state does that.

- **Docket numbers** are asked for at pickup and only for services that need one — that is when a
  courier or bus office actually hands one over. Asking hours later means asking someone to
  remember it.
- **Delivering and failing both open a panel** rather than firing on the tap, because both write a
  permanent record.
- **Proof photos** upload straight to storage through a presigned PUT, so the bytes never pass
  through the API — which is what makes a photo practical from a doorstep on a phone connection.
- **A failed attempt stays with the agent**, not back in the pool: the goods are physically in
  their van. Common reasons are one tap so the field is actually filled.
- Call and Directions are one tap each, from the vendor's own address.

### Authorisation

Every method resolves the caller's tagged services and ends up in `assertAgentCanAct`. The tags
are re-read **on every request**, so untagging somebody takes effect on their next tap rather than
their next sign-in.

Seeing and acting are separated on purpose. Seeing is a service question — anything unclaimed on
my services is mine to look at. Acting is an ownership one — once somebody holds it, only they can
move it, because **two handovers recorded for the same goods is how a dispute becomes
unwinnable**.

Claiming is a conditional `updateMany` on `assignedToId: null`, so two agents tapping "accept" at
the same moment cannot both win. The loser gets a clear message instead of a silent overwrite.

Refusals are **404, not 403**: a 403 would confirm a consignment exists, and an agent could walk
ids to learn which vendors the business ships for.

---

## The state machine

Legal moves live in one table in `delivery-scope.ts`, so a stale phone screen tapping "delivered"
on something already returned is refused by the rule rather than by whichever handler checked.

```
UNASSIGNED → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
                ↓            ↘         ↓
           (back to pool)      FAILED ⇄ (retry)
                                 ↓
                             RETURNED
```

Two refusals are worth stating, because both are business rules rather than technical ones:

- **Goods already collected cannot be handed back to the pool.** They are in a van; releasing them
  would lose track of them.
- **A consignment on the road cannot be cancelled.** Cancelling would leave the orders looking
  cancelled while they still arrive.

Delivered, returned and cancelled are final.

---

## The admin side

| Screen | What it is for |
|---|---|
| **Delivery board** `/admin/delivery` | Every consignment on the road. Leads with the two numbers that mean *stuck* — unclaimed and late — both one tap away as filters. Refreshes itself; a board you have to reload is a board people stop trusting. |
| **Unrouted tray** | Sits at the top of the board and shows itself only when it has something in it. One dropdown, one click. |
| **Services** `/admin/delivery/services` | The master. Each card shows vendors tagged, people who can carry it, and consignments open — and shouts when a service has vendors but nobody to carry it, which is the failure that silently piles up a queue. |
| **People** `/admin/delivery/people` | The roster, with services editable in place. Flags anyone with no tags: they can sign in, but their queue will be empty. |
| **Consignment detail** | The story on the left, the three things a supervisor can do on the right: hand it to somebody, send it by a different service, call it off. |

Assigning refuses a delivery person not tagged with that service — otherwise an admin could hand a
bus consignment to a local rider whose own app would then refuse to show it to them.

Vendor tagging lives on the vendor's own detail page, next to the delivery preference, with the
default set by starring one — and it says in one line what it will cause.

---

## Files

| Piece | Where |
|---|---|
| Routing rule | `backend/src/services/delivery/delivery-routing.service.ts` |
| Consignment lifecycle | `backend/src/services/delivery/delivery-assignment.service.ts` |
| Scope + state machine (pure, tested) | `backend/src/services/delivery/delivery-scope.ts` |
| Admin API | `backend/src/modules/admin-delivery/` → `/api/v1/admin/delivery-department` |
| Delivery portal API | `backend/src/modules/delivery-portal/` → `/api/v1/delivery-portal` |
| Dispatch hook | `dispatch.service.ts` → `markDispatched`, plus `setBatchDeliveryService` |
| Admin screens | `frontend/src/features/delivery/components/`, `app/(admin)/admin/delivery/` |
| Delivery app | `frontend/src/app/(delivery)/`, `frontend/src/layouts/delivery-layout.tsx` |
| Vendor tagging card | `frontend/src/features/delivery/components/vendor-delivery-services-card.tsx` |

Note `/api/v1/admin/delivery-department` is distinct from the pre-existing `/api/v1/admin/delivery`,
which is the platform's delivery-charge and pickup settings.

---

## Built for what comes next

The same seams as the support desk, for the same reason:

- Routes gated by `DELIVERY_DESK_ROLES`, `DELIVERY_ADMIN_ROLES` and `DELIVERY_PORTAL_ROLES` in
  `constants/roles.ts` — never inline arrays. A dedicated delivery-supervisor role is one line.
- The portal service takes the acting user's id on every method and assumes no admin context.
- `slaHours` is copied onto the consignment at creation, so an SLA breach is judged against the
  promise in force on the day rather than whatever the setting says later.

---

## Verification

- Backend typecheck clean; frontend typecheck clean.
- ESLint clean on all new paths. (Backend reports `no-unsafe-*` and `any` template-literal noise
  wherever Prisma is used in this environment, because the client is not generated here; it
  disappears after `prisma generate`.)
- Unit tests: **63 pass** — accounting 24, reprint window 7, partner scope 6, partner view-as gate
  9, and **17 new** on delivery visibility, who may act, and every edge of the state machine.

**After pulling this branch, run `npx prisma generate && npx prisma migrate dev`.** Prisma's engine
binaries could not be downloaded in the environment this was written in, so the schema was
validated with the bundled WASM engine and no migration has been generated.

Seed at least one delivery service before dispatching, or every consignment lands in the unrouted
tray.

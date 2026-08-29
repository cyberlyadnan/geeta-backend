# Milestone 11 — Support Desk, Vendor Reports & the Channel Partner Programme

Three features, one release. They ship together because they share a spine: every one of them
gives somebody sight of order and money data that already existed, and the hard part in each case
was deciding precisely who may see what, and enforcing that structurally rather than by
convention.

---

## 1. Vendor reports

**What the vendor gets.** A reports home with the period's headline numbers and a spend trend; a
full purchase register with filters (status, product family, amount band, free text, date range,
sort); an invoice register that names the orders each invoice covers, with the PDF one click away;
and a wallet statement. Every screen exports to Excel, and there is a single **CA pack** that
bundles the whole lot for the period their accountant asks for.

**Why it is built the way it is.** The vendor's accountant needs a document, not a screen. So the
export is not a CSV dump of what happens to be on screen — it paginates through the entire period
server-side and writes a formatted workbook using the same `WorkbookBuilder` the admin finance
exports use. A vendor and their CA looking at the same figures as the admin is not a coincidence;
they are computed from the same tables by the same service.

| Piece | Where |
|---|---|
| Report data | `backend/src/modules/vendor-reports/vendor-reports.service.ts` |
| Excel packs | `backend/src/modules/vendor-reports/vendor-report-export.service.ts` |
| Screens | `frontend/src/features/vendor-reports/` |
| Routes | `/vendor/reports`, `/purchases`, `/invoices`, `/wallet` |

Packs: `purchase-register`, `invoice-register`, `wallet-statement`, `ca-pack`.

---

## 2. The support desk

### The vendor's side

Two doors, matching how a print customer actually thinks about a problem: **"I need a reprint"**
and **"something else is wrong"**.

The reprint path asks for the order number *first* and checks it immediately. That single ordering
decision is the design of the whole feature: a vendor whose window has closed learns so in one
second, with the date it closed and the number to call — rather than after filling a form and
uploading a video. The problem section stays inert until the order is confirmed eligible.

The complaint path takes a category, an optional order, a description and media. Photo and video
upload straight to storage through a presigned URL, so a 90 MB video of a damaged consignment is
practical to attach from a phone on a shop floor; the file never passes through the API.

Vendors get a request list with a "needs your reply" count, a ticket page with the full
conversation, a media lightbox, the event history, a one-tap rating, and — when a reprint is
approved — a card linking straight into normal order tracking for the new job.

### The desk's side

A queue with the filters a shift actually runs on (status tabs with server-wide counts, type,
assignee, unassigned-only, **past-SLA-only**, search, sort), refreshing every 30 seconds so two
people do not work the same ticket. A ticket page with the conversation, internal notes, assign,
priority, approve-reprint, reject, resolve, close and reopen. A settings screen for the rules.

**Decisions worth keeping:**

- **The reprint window is a runtime setting, not a constant.** `SupportSettings.reprintWindowDays`
  (default 15). The eligibility service never knows its value; the admin moves it and the vendor
  landing copy, the eligibility check and the error message all move together.
- **Eligibility is snapshotted onto the ticket.** Once a request is accepted, later changes to the
  window must not retroactively invalidate it.
- **`NOT_YOUR_ORDER` returns the same wording as `ORDER_NOT_FOUND`.** Otherwise order numbers could
  be probed.
- **Approval and order creation are one action by default** (`createOrderNow: true`). Splitting
  them produces the failure this module exists to prevent: a ticket marked approved that nobody
  ever turned into a job.
- **The reprint order is cloned, not re-ordered.** `reprint-order.service.ts` copies the original's
  frozen price snapshot, configurations and approved artwork; it deliberately does *not* call
  `OrdersService.create`, which would re-price from the live catalogue and debit the wallet again.
  The new order carries `isReprint`, `reprintOfOrderId`, `walletDeducted: false`, and is named
  `REPRINT — <original>`, so it is visibly a reprint everywhere in the order flow.
- **Reprints are free by default**; a charge is a number an approver has to type.
- **Internal notes are filtered in the query, not in the response mapper**, so a vendor request
  never loads them into memory at all.

### Built for a separate support panel later

The user asked that a standalone support login be easy to add later. So:

- A `SUPPORT` role exists now, slotted at 45 in `ROLE_HIERARCHY` (between STAFF 40 and MANAGER 60).
- Routes are gated by the shared constants `SUPPORT_DESK_ROLES`, `SUPPORT_DECISION_ROLES` and
  `SUPPORT_ADMIN_ROLES` — never by an inline role array. The future portal's middleware reads the
  same constants.
- `AdminSupportService` takes the acting user's id on every method and assumes no admin context.
  The same service backs an ADMIN in the admin portal today and a SUPPORT operator in their own
  portal tomorrow. **The standalone panel is a routing change, not a rewrite.**

| Piece | Where |
|---|---|
| Eligibility rule | `backend/src/services/support/reprint-eligibility.service.ts` |
| Window arithmetic (pure, tested) | `backend/src/services/support/reprint-window.ts` |
| Reprint order creation | `backend/src/services/support/reprint-order.service.ts` |
| Tickets, messages, events | `backend/src/services/support/support-ticket.service.ts` |
| Vendor API | `backend/src/modules/support/` |
| Desk API | `backend/src/modules/admin-support/` |
| Vendor screens | `frontend/src/features/vendor-support/` |
| Desk screens | `frontend/src/features/admin-support/` |

---

## 3. Channel partners

A **channel partner** is a vendor who introduces and looks after other vendors. Admin promotes an
existing vendor, assigns vendors to them, and can see what that network is worth.

### The partner's panel

Two screens, and then the vendor's own portal.

`/partner` is a network dashboard — vendor count against *active* vendor count, business
generated, average order value, wallet held across the network, a month-by-month spend chart, the
top vendors and the latest orders. `/partner/vendors` is the roster. That is the whole panel.

**Opening a vendor does not open a summary of them — it opens their portal.** Clicking a vendor
puts the partner inside the real vendor portal, the same screens that vendor sees, landing on the
order stage board. Not a copy of it: the vendor's own pages, served by the vendor's own endpoints.
A partner and their vendor on the phone are looking at the same pixels.

There is no per-vendor endpoint in the partner API and no vendor-detail screen in the partner
panel, deliberately. A parallel read path is a second version of the truth that drifts from the
first the moment either changes.

### "View as vendor" — how it works, and why it is safe

One header, `X-Partner-View: <vendorUserId>`, attached by the frontend to reads while a view is
active. It is resolved in `backend/src/middleware/partner-view.ts`, called from inside
`authenticate` before the request context is preloaded — so `req.user`, `req.authContext` and the
observability vendor id all describe one identity, with no window in which half the request is the
partner and half is the vendor. `req.partnerView` keeps the real actor's id for the logs.

The gate fails shut on every axis at once:

| Rule | Effect |
|---|---|
| GET/HEAD only | Every write is refused before any route sees it. Not a list of protected mutations someone must remember to extend — the default is no. |
| Never on `/auth` or `/storage` | Tokens are never issued for another account, and a signed upload URL is a write wearing a GET. |
| `/partner/*` ignores the header | Those endpoints are always about the partner themselves — answering `/partner/me` as the vendor would make the way back disappear. |
| Link re-checked every request | Not cached, not carried in a token. Suspending a partner or ending an assignment bites on their very next request. |
| 404, never 403 | A partner cannot discover which vendor ids exist by probing the header. |
| No permissions carried over | A viewing partner holds exactly the rights of a plain vendor doing a GET. |

The pure part of that decision lives in `partner-view-rules.ts` and is unit-tested across every
method and path shape, including prefix-boundary cases (`/api/v1/partners-report` must not inherit
the `/api/v1/partner` exemption).

**Four layers on the client, none of them load-bearing on their own.** The axios interceptor
refuses any non-GET while a view is active; action destinations (`/vendor/orders/new`,
`/vendor/wallet/add-money`, the support forms, settings) refuse to render; action-only nav entries
are removed and action buttons hidden; and a sticky indigo banner names the vendor with an exit
button. The server rule above is the one that actually holds — the rest is so a partner is never
invited to click something that will fail.

**Cache hygiene.** Vendor queries are keyed by screen, not by whose data they hold —
`["vendor-orders", …]` means "the signed-in vendor's orders". So entering and leaving a view both
clear the React Query cache and the IndexedDB order copy first. Without that, one business's
orders would paint under another's name. The view target itself lives in **sessionStorage**, so a
tab reopened tomorrow lands in the partner's own portal, and it is cleared with the auth tokens on
sign-out.

### Commission — configured now, paid later

The user's instruction was to make the reward mechanism work for discount pricing today and for
commissions later. So `ChannelPartnerCommissionPlan` exists with basis, rate, minimum order value,
monthly cap and effective dates; an ACTIVE plan makes an **indicative estimate** appear on the
partner's dashboard and the admin's partner page. Nothing accrues, nothing is credited, and
nothing reaches the ledger — the estimate is returned in its own field with `isIndicativeOnly:
true` so no downstream consumer can mistake it for a liability. When commissions become real, the
accrual posts through an accounting projection adapter exactly like every other money flow, and
the plan model is already there to drive it.

| Piece | Where |
|---|---|
| Scope gate | `backend/src/services/channel-partner/partner-access.service.ts` |
| Scope rule (pure, tested) | `backend/src/services/channel-partner/partner-scope.ts` |
| Network numbers | `backend/src/services/channel-partner/partner-stats.service.ts` |
| Partner API (three GETs) | `backend/src/modules/channel-partner/` |
| View-as gate | `backend/src/middleware/partner-view.ts` |
| View-as rules (pure, tested) | `backend/src/middleware/partner-view-rules.ts` |
| Admin API | `backend/src/modules/admin-channel-partners/` |
| Partner panel | `frontend/src/app/(partner)/`, `frontend/src/layouts/partner-layout.tsx`, `frontend/src/features/channel-partner/` |
| View state + header | `frontend/src/store/partner-view.store.ts`, `frontend/src/lib/api-client.ts` |
| Banner, route guard, disabling | `frontend/src/features/channel-partner/components/vendor-view-*.tsx`, `view-only-block.tsx` |
| Admin screens | `frontend/src/features/admin-channel-partners/` |

---

## Schema changes

New enums: `SupportTicketType`, `SupportTicketStatus`, `SupportTicketPriority`,
`SupportTicketCategory`, `SupportTicketChannel`, `SupportAttachmentKind`,
`SupportMessageAuthorType`, `ChannelPartnerStatus`, `ChannelPartnerLinkSource`, `CommissionBasis`,
`CommissionPlanStatus`.

New models: `SupportTicket`, `SupportTicketMessage`, `SupportTicketAttachment`,
`SupportTicketEvent`, `SupportSettings`, `SupportTicketNumberSequence`, `ChannelPartnerProfile`,
`ChannelPartnerAssignment`, `ChannelPartnerCommissionPlan`.

Changed: `RoleName` gained `SUPPORT`. `ProductionOrder` gained `isReprint`, `reprintOfOrderId`, the
`OrderReprintChain` self-relation and two indexes. `User` and `RetailCustomer` gained the
corresponding back-relations.

**After pulling this branch, run `npx prisma generate && npx prisma migrate dev`.** Prisma's engine
binaries could not be downloaded in the environment this was written in, so the schema was
validated with the bundled WASM engine and the migration has not been generated.

---

## Verification

- Backend typecheck: clean (`tsc --noEmit`, against a locally generated client).
- Frontend typecheck: clean.
- ESLint: clean on all new backend and frontend paths. (Backend lint reports `no-unsafe-*` noise
  wherever the Prisma client is untyped in this environment; that disappears once
  `prisma generate` has run.)
- Unit tests: **46 pass**, covering the accounting core (24), the reprint window at its boundaries
  (7), partner scoping (6) and the view-as gate (9).

Run them with:

```bash
npx tsc -p tsconfig.test.json && node --test dist/services/**/__tests__/*.test.js
```

### What the reprint-window tests pin down

The boundary is inclusive: on a 15-day window, day 15 is still open and day 16 is not. A vendor
told "fifteen days" counts the fifteenth day as theirs, and a rule that expired a day early would
be read — correctly — as the business going back on its word.

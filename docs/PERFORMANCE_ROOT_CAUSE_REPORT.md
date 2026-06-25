# Backend Performance — Root Cause Analysis Report

**Date:** 2026-06-26  
**Environment:** Local dev (India) → Supabase PostgreSQL `aws-1-ap-southeast-2` (Sydney)  
**Runtime pooler:** Session mode port **5432** (auto-upgraded from configured 6543)

---

## Executive summary

### Root cause (evidence-based)

**Primary bottleneck: network round-trip time (RTT) between the application and Supabase PostgreSQL in `ap-southeast-2` (Sydney).**

Each Prisma query pays approximately **~297ms wall-clock** in warm conditions (measured). PostgreSQL **execution** for the same queries is **0.05–3ms** (EXPLAIN ANALYZE). The monitoring “Database” phase reflects **round-trips × query count**, not slow SQL or Supabase CPU.

**This is not caused by:**
- Supabase Free plan CPU/memory (query execution is sub-millisecond to low milliseconds on tiny datasets)
- Missing indexes at current data volume (seq scans on 3–4 rows execute in &lt;0.1ms)
- Prisma creating multiple clients or reconnecting per request

**Secondary contributors:**
- Sequential DB round-trips per API (login, order create, vendor detail)
- Synchronous activity-log writes on mutation paths (partially fixed)
- Transaction pooler (6543) when used — adds BEGIN/COMMIT per query (~2× RTT overhead)
- Monitoring metric `databaseMs` = **sum** of query durations (parallel queries can inflate; residual `businessLogicMs` can hit 0)

---

## Step 1 — Request profiling (implemented)

### Instrumentation added

| Phase | How measured |
|-------|----------------|
| Validation | `validate()` middleware → `beginValidation` / `endValidation` |
| Authentication | `authenticate` middleware → JWT verify timed |
| Database | Prisma `$extends` performance extension per operation |
| Serialization | `res.json` / `res.send` wrappers |
| Business logic | Residual: `total - validation - auth - database - serialization` |

Every request with queries or duration ≥50ms logs a **`request_breakdown`** entry to `logs/performance-*.log` with top operations.

**Example breakdown format (from `request-breakdown.ts`):**

```
POST /api/v1/auth/login

Validation: 2ms
Authentication: 0ms
Database (sum of queries): 892ms
Business logic (residual): 45ms
Serialization: 1ms
Total: 940ms

Query count: 3
Top operations:
  user.findFirst: 298ms [database]
  user.update: 301ms [database]
  refreshToken.create: 293ms [database]
  Password verify: 42ms [business]
```

Use `X-Request-ID` → `GET /api/v1/admin/monitoring/timeline/:requestId` for live inspection.

**Env:** `OBSERVABILITY_REQUEST_BREAKDOWN=false` disables detailed breakdown logs.

---

## Step 2 — Prisma profiling

- **Extension:** `prisma-performance.extension.ts` times every `model.operation`
- **Slow query threshold:** `OBSERVABILITY_SLOW_QUERY_MS` (default 100ms)
- **N+1 detection:** fixed off-by-one in pattern counting
- **Labels:** `User.findFirst`, not raw SQL — use `npm run perf:explain` for SQL plans

### Measured warm query latency (2026-06-26)

| Query | Wall-clock (app → DB → app) | Postgres execution (EXPLAIN) |
|-------|------------------------------|------------------------------|
| `SELECT 1` | **296ms** avg | N/A |
| User login lookup | **~611ms** cold / **~297ms** warm | **0.094ms** |
| Activity feed | **~611ms** round trip | **3.285ms** |
| Vendor list | **~1215ms** round trip | **0.123ms** |
| Refresh token | **~616ms** round trip | **1.684ms** |

**Conclusion:** Prisma reports “slow queries” because **100ms &lt; 297ms RTT**, not because SQL is slow.

---

## Step 3 — Connection pooling audit

| Check | Result |
|-------|--------|
| Single `PrismaClient` | ✅ `globalForPrisma` singleton in `database.ts` |
| New client per request | ✅ None found |
| `$connect()` per request | ✅ Only at server bootstrap |
| `$disconnect()` per request | ✅ Only on shutdown |
| Runtime URL | Session pooler `5432` via `resolveRuntimeDatabaseUrl()` |
| Configured URL | Transaction pooler `6543` (auto-upgraded at runtime) |

**First `$connect`:** **2994ms** (cold pool + TCP + auth)  
**TCP connect alone:** **559ms**  
**DNS:** **30ms**

Connection **reuse** works: warm queries ~297ms vs cold first query ~611ms.

---

## Step 4 — Network latency (measured)

Run: `npm run perf:network`

```
DNS lookup:           30.1ms
TCP connect:          559.14ms
Prisma $connect:      2994.29ms (first)
Query warm avg:       296.59ms
Transaction 2×SELECT: 1788.87ms (~2× single query)
```

**Geography:** App in India, database in **ap-southeast-2 (Sydney)**. Physics dominates; upgrading Supabase plan does not move the database closer.

**Mitigations with highest ROI:**
1. Region closer to users (e.g. `ap-south-1` Mumbai) — estimated **~250ms+ savings per query**
2. Reduce round-trips (batching, caching, defer writes)
3. Session pooler 5432 (already active) — avoid 6543 transaction pooler

---

## Step 5 — Query analysis (code audit)

### High-impact patterns

| Location | Issue | Queries/request |
|----------|-------|-----------------|
| `auth.login` | findFirst + $transaction(update+create) | **~2–3** RTTs |
| `orders.create` | settings + profile + price + snapshot + create | **~6–8** RTTs |
| `admin-vendors.getById` | heavy include + 100 activity rows | **2** RTTs (now parallel) |
| `orders.findAll` | unbounded `findMany` + deep includes | **1** RTT, unbounded rows |
| `vendor-compliance.listByVendor` | unbounded heavy includes | **2** RTTs |
| `contact.getStats` | 5 counts/groupBy | **3** RTTs (optimized + cached) |
| `deliverySettings.getOrCreate` | find + create on miss | **1–2** RTTs (now upsert + 60s cache) |

### N+1 / loops

- `vendor-compliance.submitCompliance` — per-item await in loop
- `admin-attributes.create` — per-value creates
- Not yet observed at scale in metrics; fix when compliance volume grows

---

## Step 6 — Schema & indexes

### Applied in `schema.prisma` + `scripts/perf/add-performance-indexes.sql`

| Table | Index | Why |
|-------|-------|-----|
| `activity_logs` | `(vendor_profile_id, created_at DESC)` | Admin feed currently scans `created_at` then filters |
| `activity_logs` | `(entity_type, entity_id, created_at DESC)` | Catalog audit timeline |
| `refresh_tokens` | `(user_id, revoked_at)` | Logout / refresh paths |
| `vendor_profiles` | `(account_status, created_at DESC)` | Admin vendor list |
| `production_orders` | `(customer_id, created_at DESC)` | Order history |
| `orders` | `(user_id, created_at DESC)`, `deleted_at` | Legacy order lists |

**Apply SQL manually if migrate fails:**

```bash
npx dotenv -e .env -- prisma db execute --file scripts/perf/add-performance-indexes.sql
```

---

## Step 7 — EXPLAIN ANALYZE findings

Run: `npm run perf:explain`

| Query | Plan | Execution | Issue at scale |
|-------|------|-----------|----------------|
| User by email | Seq Scan (4 rows) | 0.094ms | OK now; index on `(email, deleted_at)` helps at 10k+ users |
| Activity feed | **Index Scan on `created_at` only** + filter | 3.3ms | **Wrong index** — composite `(vendor_profile_id, created_at)` added |
| Vendor by status | Seq Scan + Sort | 0.12ms | Composite index added for scale |
| Refresh token | Index on `expires_at` + filter `revoked_at` | 1.7ms | Composite `(user_id, revoked_at)` added |

**No sequential scans on large tables at current row counts** — all tables are tiny (dev).

---

## Step 8 — Business logic

### Fixed in this pass

- `admin-vendors.getById` — `Promise.all` profile + activities
- `auth.register` — parallel email check + role fetch
- `auth.refresh` — revoke + create in single `$transaction`
- `contact.getStats` — 5 queries → 3 groupBy + derive totals; 30s TTL cache
- `deliverySettings` — upsert + 60s TTL cache
- Activity logs on hot paths — `logAsync()` (non-blocking)

### Still sequential (future work)

- `orders.create` — redundant version read after pricing
- `admin-vendors.updateStatus` — 3 writes + log (could be one transaction)
- `wallet.getSummary` — `ensureWallet` then parallel counts

---

## Step 9 — Auth flow audit

### Login (success path) — target shape

| Step | Blocking? | RTTs |
|------|-----------|------|
| findFirst user | Yes | 1 |
| bcrypt compare | Yes (CPU ~40ms) | 0 |
| vendor gate | Yes (no extra DB if profile loaded) | 0 |
| $transaction lastLogin + refreshToken | Yes | 1 |
| activity log | **No** (`logAsync`) | 0 |
| JWT build | Yes (CPU) | 0 |

**Estimated total DB time (monitoring):** ~600–900ms from **2 round-trips × ~297ms**, not slow SQL.

### Blocked vendor login

- Activity log was **sync** — now `logAsync` (saves ~300ms before 403)

---

## Step 10 — Background work

| Workload | Before | After |
|----------|--------|-------|
| Login activity | async | async ✅ |
| Vendor registration log | sync | `logAsync` ✅ |
| Admin vendor mutations | sync | `logAsync` ✅ |
| Notifications / email | BullMQ workers exist | not wired for activity logs |
| Wallet history | sync | future queue |

**Recommendation:** Add `activity-logs` BullMQ queue when Redis is always on in production. `logAsync` is sufficient for correctness with lower latency now.

---

## Step 11 — Caching (implemented / recommended)

| Endpoint / data | TTL | Status |
|-----------------|-----|--------|
| `GET /auth/me` | 10s | ✅ existing |
| `GET /admin/vendors/stats` | 15s | ✅ existing |
| Activity feed | 10s | ✅ existing |
| Monitoring dashboard | 5s | ✅ existing |
| DB health probe | 30s | ✅ existing |
| Delivery settings | 60s | ✅ **added** |
| Contact inquiry stats | 30s | ✅ **added** |
| Categories tree | 5min | 🔲 recommended |
| Role lookups | 1h | 🔲 recommended (singleton rows) |

---

## Step 12 — Supabase plan analysis

| Metric | Evidence |
|--------|----------|
| CPU saturation | **No** — EXPLAIN execution &lt;5ms |
| Disk IO | **No** — `shared hit` on all buffers in EXPLAIN |
| Connection limit | **No** — single Prisma pool, connection_limit=10 |
| Plan throttling | **Not observed** — latency consistent with RTT |

**Verdict:** Supabase **Free/Pro plan is not the measured bottleneck**. **Region (Sydney vs India)** is.

**If upgrading Pro:** expect **~0ms** improvement per query unless moving region or using read replicas closer to users.

**If moving to `ap-south-1`:** estimated **50–70% reduction** in per-query latency (industry typical India→Mumbai vs India→Sydney).

---

## Step 13 — Evidence tables

### API probe (`npm run perf:api`)

| Endpoint | Cold | Warm (cached) |
|----------|------|---------------|
| `GET /health` | **727ms** (DB probe) | **2.4ms** |
| `GET /health/database` | 3.5ms | 4ms (30s cache) |

### Top APIs likely to show high “Database” ms (from architecture)

| API | Est. DB RTTs | Est. DB phase |
|-----|--------------|---------------|
| `POST /auth/login` | 2 | ~600ms |
| `POST /auth/refresh` | 2 | ~600ms |
| `POST /auth/register-vendor` | 4–5 | ~1200–1500ms |
| `POST /orders` | 6–8 | ~1800–2400ms |
| `GET /admin/vendors/:id` | 2 | ~600ms |
| `GET /orders` (unbounded) | 1 | ~300ms + payload |
| `GET /admin/vendors` list | 2 parallel | ~300ms |
| `GET /wallet/summary` | 4–5 | ~1200ms |

### Top “slow queries” (wall-clock, not SQL)

1. Any query — **~297ms** baseline RTT  
2. `$transaction` with 2 ops — **~600–1800ms**  
3. Activity log INSERT — **~297ms** (was on critical path; now async)  
4. `deliverySettings` read — **~297ms** (now cached)  
5. Health `SELECT 1` — **~700ms** cold / **0ms** cached  

---

## Code changes implemented (this pass)

1. **Profiling:** `authenticationMs`, per-operation breakdown, `request_breakdown` logs  
2. **N+1 fix** in prisma extension  
3. **`activityLogService.logAsync`** — non-blocking writes  
4. **Auth:** parallel register, transaction refresh, async blocked-login log  
5. **Admin vendors:** parallel `getById`, async mutation logs  
6. **Delivery settings:** upsert + TTL cache  
7. **Contact stats:** 3 queries + TTL cache  
8. **Monitoring:** removed duplicate DB probe on dashboard refresh  
9. **Schema + SQL:** composite indexes for hot paths  
10. **Scripts:** `npm run perf:network`, `perf:explain`, `perf:api`  

---

## Before vs after estimates

| Scenario | Before | After | Notes |
|----------|--------|-------|-------|
| Login success | ~900–1200ms DB phase | ~600–900ms | 2 RTTs; activity log off path |
| Blocked vendor login | +300ms sync log | +0ms | logAsync |
| `GET /admin/vendors/:id` | ~600ms sequential | ~300ms | parallel queries |
| `GET /contact/stats` | 5 RTTs ~1500ms | 3 RTTs ~900ms, then cached | |
| Order create settings | 2 RTTs every time | 0 RTTs for 60s | delivery cache |
| `GET /health` warm | 727ms | 2.4ms | existing TTL cache |

**Target under 100ms for simple APIs** requires either **region move** or **edge cache** — not achievable with ~297ms RTT per DB hop.

---

## Prioritized optimization plan

### P0 — Infrastructure (highest impact)

1. **Move Supabase project to `ap-south-1` (Mumbai)** or deploy API in Sydney — saves ~250ms/query  
2. **Keep session pooler 5432** — never use 6543 for Express  
3. **Apply composite indexes** — `scripts/perf/add-performance-indexes.sql`  

### P1 — Application (implemented / continue)

4. ✅ Async activity logs on hot paths  
5. ✅ Delivery settings + contact stats cache  
6. ✅ Request/auth phase profiling  
7. Batch login/refresh writes (transactions)  
8. Paginate `orders.findAll`, `vendor-compliance` lists  

### P2 — Architecture

9. Redis cache for categories, roles, public product lists  
10. BullMQ queue for activity logs in production  
11. Read-through cache for `GET /auth/me` at CDN/edge  

### P3 — Monitoring accuracy

12. Report `databaseWallMs` vs `databaseSumMs` (max parallel query window)  
13. Exclude health probes from global query metrics  
14. Wire `asyncHandler` on health/monitoring controllers  

---

## How to reproduce

```bash
cd backend
npm run perf:network    # RTT + connect benchmarks
npm run perf:explain    # EXPLAIN ANALYZE (note: wall-clock includes RTT)
npm run perf:api        # HTTP probe (set SEED_SUPER_ADMIN_EMAIL/PASSWORD for login)
```

Tail performance logs:

```bash
Get-Content logs\performance-*.log -Tail 50 -Wait
```

---

## Conclusion

**The “Database” phase in monitoring is real wall-clock time waiting on Supabase over the network, not slow PostgreSQL execution.** Evidence: **297ms/query** warm RTT vs **&lt;5ms** EXPLAIN execution. Fix by reducing round-trips, caching, async writes, and **deploying closer to the database region**. Supabase plan tier is not the root cause based on current measurements.

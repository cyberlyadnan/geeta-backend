# Enterprise Performance Optimization Pass — Report

**Date:** 2026-06-26  
**Scope:** Architectural optimizations (not micro-tuning)  
**Prior audit:** `docs/PERFORMANCE_ROOT_CAUSE_REPORT.md` (network RTT = primary latency factor)

---

## Architecture changes implemented

### 1. Request-scoped cache (Step 1–2, 10)

**Files:** `common/cache/request-cache.ts`, `request-cache-accessor.ts`, `observability/request-context.ts`

- `loadOncePerRequest(key, loader)` — same row never fetched twice per HTTP request
- Concurrent-safe via `Promise` deduplication
- Metrics: `cacheStats.requestHits` / `requestMisses` on every `request_completed` log

### 2. Redis distributed cache (Step 11)

**Files:** `common/cache/redis-cache.ts`, `common/cache/cache-keys.ts`

| Key | TTL | Data |
|-----|-----|------|
| `role:{name}` | 1h | Role rows |
| `categories:tree:v1` | 5m | Category parent/child graph |
| `delivery:settings:v1` | 2m | Delivery platform settings |

Falls back to DB when Redis unavailable.

### 3. Repository layer (Step 3)

**Directory:** `src/repositories/`

| Repository | Responsibility |
|------------|----------------|
| `user.repository` | Login + session user loads (request cache) |
| `vendor.repository` | Vendor profile by user/id (request cache) |
| `role.repository` | Role lookup (Redis + request cache) |
| `wallet.repository` | Wallet ensure/find (request cache) |
| `pricing.repository` | Version pricing bundle (request + 5m local TTL) |
| `category.repository` | Category tree resolution (Redis + request cache) |
| `order.repository` | Paginated list + detail with minimal `select` |

### 4. Order creation consolidation (Step 7, 9)

**File:** `modules/orders/orders.service.ts`

| Before | After |
|--------|-------|
| 6–8 DB round-trips | **4–5** round-trips |
| Sequential settings + vendor, then price | **Parallel** settings + vendor + price |
| Redundant `version.findUnique` | **Removed** — uses `priceResult.versionId` |
| Separate snapshot + order writes | **Single `$transaction`** |
| Deep `include` on create response | **Explicit `select`** (DTO-sized) |

**Estimated improvement:** ~2 RTTs saved (~600ms at 300ms/RTT to Sydney).

### 5. Authentication (Step 8)

**File:** `modules/auth/auth.service.ts`

- Login via `userRepository.findForLogin` (request-deduped)
- Roles via `roleRepository` (Redis-cached)
- `getMe` via `userRepository.findSessionById` inside TTL cache
- Activity logs → BullMQ or async fallback

**Round-trips (success login):** 2 (`findFirst` + `$transaction`)

### 6. Background processing (Step 12)

**Files:** `queues/activity-log.queue.ts`, `jobs/activity-log.job.ts`

- New queue: `activity-logs`
- Worker concurrency: 10
- `activityLogService.logAsync()` enqueues when Redis up; else fire-and-forget DB write
- Worker registered in `workers/index.ts`

### 7. Pagination (Step 17)

- `GET /orders` — `page` + `limit` (max 50), returns `{ items, meta }`
- List query uses `ORDER_LIST_SELECT` (minimal fields, `items.take: 1`)

### 8. Wallet (Step 6)

- `getSummary` uses `walletRepository.ensureByUserId` (request-deduped)
- Payment counts + recent txs remain parallel

### 9. Products / categories

- Category tree via `categoryRepository` (Redis-backed, no full-table load per filter in same request)

### 10. Monitoring (Step 18)

- Request logs include `cache: { requestHits, requestMisses, redisHits, redisMisses }`
- Per-request `request_breakdown` with auth + DB phases (from prior pass)

### 11. Database indexes (Step 13)

Schema + `scripts/perf/add-performance-indexes.sql` (from prior pass):

- `activity_logs(vendor_profile_id, created_at DESC)`
- `production_orders(customer_id, created_at DESC)`
- `refresh_tokens(user_id, revoked_at)`
- `vendor_profiles(account_status, created_at DESC)`

---

## API optimization summary

| API | Queries Before | Queries After | RTTs Before* | RTTs After* | Changes |
|-----|----------------|---------------|--------------|-------------|---------|
| `POST /auth/login` | 2–3 | 2 | 2–3 | 2 | Activity → BullMQ |
| `POST /orders` | 6–8 | 4–5 | 6–8 | 4–5 | Parallel reads, 1 tx, no redundant version |
| `GET /orders` | 1 unbounded | 2 paginated | 1 | 2 | Pagination + minimal select |
| `GET /orders/:id` | 1 heavy include | 1 select | 1 | 1 | `ORDER_DETAIL_SELECT` |
| `GET /auth/me` | 1 | 0–1 | 0–1 | 0–1 | Request repo + 10s TTL |
| `GET /wallet/summary` | 4–5 | 4–5 | 4–5 | 4–5 | Request-deduped wallet |
| `GET /products` (category filter) | 2+ | 1–2 | 2+ | 1–2 | Redis category tree |

\*RTT = round-trip to Supabase (~297ms warm from India → Sydney per prior benchmarks)

---

## Realistic targets vs geography

| Target | Achievable without region change? |
|--------|-----------------------------------|
| Simple APIs &lt;100ms | ✅ When cached (health, settings) |
| Auth &lt;250ms | ⚠️ Needs ~2 RTTs = ~600ms at current geography |
| CRUD &lt;200ms | ⚠️ 1 DB hop ≈ 300ms |
| Order create &lt;700ms | ⚠️ 4–5 hops ≈ 1200–1500ms |

**To hit all targets:** deploy API + DB in same region (e.g. `ap-south-1`) or add edge caching for read-heavy endpoints.

---

## How to run workers (activity logs)

```bash
# Terminal 1 — API
npm run dev

# Terminal 2 — workers (requires Redis)
npm run start:worker
# or dev: tsx src/workers/index.ts
```

---

## Next architectural phases (recommended)

1. **Region migration** — Supabase `ap-south-1` (highest ROI)
2. **Extract repositories** for `admin-products`, `vendor-compliance`, `payments`
3. **Redis cache** for pricing bundles (serialize DTO, not raw Prisma graph)
4. **Read replicas** for dashboard/report queries
5. **Cursor pagination** for activity logs and compliance lists
6. **Event-driven** order post-create (invoice, notification enqueue)

---

## Files added / modified (this pass)

**New:**
- `src/common/cache/request-cache.ts`
- `src/common/cache/request-cache-accessor.ts`
- `src/common/cache/redis-cache.ts`
- `src/common/cache/cache-keys.ts`
- `src/repositories/*` (7 repositories)
- `src/queues/activity-log.queue.ts`
- `src/jobs/activity-log.job.ts`
- `docs/ENTERPRISE_PERF_REPORT.md`

**Modified:**
- `orders.service.ts`, `auth.service.ts`, `products.service.ts`, `wallet.service.ts`
- `delivery.repository.ts`, `pricing.service.ts`, `activity-log.service.ts`
- `request-context.ts`, `performance.middleware.ts`
- `queueNames.ts`, `workers/index.ts`, `orders.routes.ts`

---

## Verification

```bash
npm run perf:network   # RTT baseline
npm run perf:api       # HTTP probe
# Tail logs for cache stats:
# logs/performance-*.log → request_completed.cache
```

Apply DB indexes if not yet applied:

```bash
npx dotenv -e .env -- prisma db execute --file scripts/perf/add-performance-indexes.sql
```

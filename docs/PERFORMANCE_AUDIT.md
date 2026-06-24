# Performance Audit — Geeta Print ERP

**Date:** 2026-05-25  
**Scope:** Backend (Express/Prisma), Frontend (Next.js/React Query), Infrastructure  
**Observability:** New monitoring stack at `/admin/monitoring`, `/api-docs`, `/health/*`

This audit identifies likely bottlenecks, root causes, and recommended fixes. Use the **System Monitoring** dashboard and `performance-*.log` / `application-*.log` files to validate findings under real traffic.

---

## Executive Summary

| Area | Risk | Notes |
|------|------|-------|
| Product catalog APIs | **High** | Deep Prisma `include` trees on list + detail |
| Category tree resolution | **Medium** | Full category table loaded per filtered product list |
| Wallet transactions | **Medium** | Aggressive `refetchOnMount: "always"` on frontend |
| Admin vendor detail | **Medium** | Large include + 100 activity logs |
| Metrics storage | **Low** | In-memory ring buffers (resets on restart) |
| Redis | **Low** | Optional in dev; queues disabled when down |

---

## 1. Product List APIs — Deep Join Payloads

| Field | Value |
|-------|-------|
| **Issue** | `GET /api/v1/products` and `GET /api/v1/admin/products` load nested `series → family → category → parent`, versions, images, and counts per row |
| **Severity** | **High** |
| **Cause** | `PRODUCT_LIST_INCLUDE` / `VENDOR_LIST_INCLUDE` in `admin-products.service.ts` and `products.service.ts` |
| **Recommended Fix** | Split list DTO to flat fields (category name/id only); lazy-load images; add DB indexes on `productOffering(status, visibility, deletedAt)` and `series.family.categoryId` |
| **Expected Improvement** | 40–70% faster list responses; 50%+ smaller JSON payloads |

---

## 2. Product Detail — Configuration Graph

| Field | Value |
|-------|-------|
| **Issue** | Single product detail loads full pricing rules, all configuration fields, options, and option pricing in one query |
| **Severity** | **High** |
| **Cause** | `PRODUCT_DETAIL_INCLUDE` / `VENDOR_DETAIL_INCLUDE` |
| **Recommended Fix** | Paginate configuration fields; cache published product versions in Redis; use `select` instead of broad `include` where possible |
| **Expected Improvement** | 30–60% faster detail API for complex products |

---

## 3. Category Tree — Full Table Scan

| Field | Value |
|-------|-------|
| **Issue** | `resolveCategoryTreeIds()` loads **all** categories on every product list filtered by category |
| **Severity** | **Medium** |
| **Cause** | `products.service.ts` — `prisma.category.findMany` without cache |
| **Recommended Fix** | Cache category adjacency map in memory/Redis (TTL 5–15 min); or use recursive CTE / materialized path column |
| **Expected Improvement** | Eliminates 1 query + O(n) CPU per filtered list; ~20–100ms saved |

---

## 4. Admin Vendor Detail — Activity Log Volume

| Field | Value |
|-------|-------|
| **Issue** | Vendor detail fetches profile with deep includes + 100 activity log rows |
| **Severity** | **Medium** |
| **Cause** | `admin-vendors.service.ts` `getById` |
| **Recommended Fix** | Paginate activity feed; load compliance/docs on tab expand |
| **Expected Improvement** | 25–40% faster vendor profile load |

---

## 5. Admin Wallet Detail — Parallel Heavy Queries

| Field | Value |
|-------|-------|
| **Issue** | Wallet detail runs 4 parallel `findMany` (transactions, payments, audit logs) |
| **Severity** | **Medium** |
| **Cause** | `admin-wallets.service.ts` |
| **Recommended Fix** | Ensure composite indexes on `(walletId, createdAt)`; default smaller page sizes; defer audit log fetch |
| **Expected Improvement** | 20–35% faster wallet detail |

---

## 6. Pricing Engine — Repeated Lookups

| Field | Value |
|-------|-------|
| **Issue** | `POST /products/calculate-price` may trigger multiple Prisma reads per calculation |
| **Severity** | **Medium** |
| **Cause** | `pricingEngineService.calculate` / `calculateForProduct` |
| **Recommended Fix** | Profile with new Prisma query monitor; cache version snapshot per `versionId` |
| **Expected Improvement** | 15–30% faster price calculations under load |

---

## 7. Missing Database Indexes (Review)

| Field | Value |
|-------|-------|
| **Issue** | Filter-heavy columns may lack covering indexes |
| **Severity** | **Medium** |
| **Cause** | Growth in `productionOrder`, `walletTransaction`, `vendorProfile` search filters |
| **Recommended Fix** | Run `EXPLAIN ANALYZE` on slow queries from monitoring dashboard; add indexes for `vendorProfile(accountStatus, deliveryPreference)`, `productionOrder(vendorId, createdAt)`, `contactInquiry(status, createdAt)` |
| **Expected Improvement** | 50–90% faster on large tables |

---

## 8. Frontend — Wallet Query Over-fetching

| Field | Value |
|-------|-------|
| **Issue** | Wallet balance uses `staleTime: 0` and `refetchOnMount: "always"` |
| **Severity** | **Medium** |
| **Cause** | `use-wallet-queries.ts` |
| **Recommended Fix** | Use `staleTime: 5_000` + invalidate on mutation; keep polling only on payment pending state |
| **Expected Improvement** | 50%+ fewer wallet API calls per session |

---

## 9. Frontend — Duplicate API Calls

| Field | Value |
|-------|-------|
| **Issue** | Multiple layouts/hooks may mount same queries (auth me, vendor stats) |
| **Severity** | **Low–Medium** |
| **Cause** | Shared query keys without coordinated `staleTime` |
| **Recommended Fix** | React Query monitor now warns in dev; align `staleTime` across hooks; use `enabled` guards |
| **Expected Improvement** | 10–25% fewer API calls |

---

## 10. Image Performance — R2 / Next Image

| Field | Value |
|-------|-------|
| **Issue** | Product/banner images may load unoptimized sizes from R2 |
| **Severity** | **Low–Medium** |
| **Cause** | `next/image` domains/sizes config; slider hero images |
| **Recommended Fix** | Ensure `images.remotePatterns` for R2; use `sizes` prop; track via `useImagePerformanceTracking()` |
| **Expected Improvement** | 30–50% faster LCP on catalog pages |

---

## 11. Large JSON Body Limit

| Field | Value |
|-------|-------|
| **Issue** | `express.json({ limit: '10mb' })` allows large payloads on all routes |
| **Severity** | **Low** |
| **Cause** | `app.ts` global middleware |
| **Recommended Fix** | Route-specific limits; stricter limit for most APIs |
| **Expected Improvement** | Reduced memory spikes under abuse |

---

## 12. In-Memory Metrics (Operational)

| Field | Value |
|-------|-------|
| **Issue** | API/query metrics reset on process restart |
| **Severity** | **Low** (dev/staging) |
| **Cause** | `metrics-store.ts` ring buffers |
| **Recommended Fix** | Register `MetricsExporter` for Prometheus/OpenTelemetry (stub at `observability/exporters/noop.exporter.ts`) |
| **Expected Improvement** | Persistent historical metrics in production |

---

## How to Debug a Slow API (3s+)

1. Check **X-Request-ID** response header (or frontend network tab).
2. Open **Admin → System Monitoring** → Recent Slow APIs → phase breakdown:
   - High **Database** → inspect slow queries / N+1 warnings on same dashboard.
   - High **Validation** → heavy Zod schemas or large body parsing.
   - High **Business Logic** → service-layer CPU (pricing engine, serialization).
3. `GET /api/v1/admin/monitoring/timeline/:requestId` for full query list.
4. Tail `logs/performance-*.log` for `SLOW API DETECTED` / `SLOW QUERY DETECTED`.

---

## Observability Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api-docs` | Swagger UI (JWT bearer supported) |
| `GET /api-docs.json` | OpenAPI JSON |
| `GET /health` | Overall system health |
| `GET /health/database` | PostgreSQL probe |
| `GET /health/redis` | Redis status |
| `GET /health/storage` | R2 configuration status |
| `GET /api/v1/admin/monitoring/*` | Admin metrics (auth required) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OBSERVABILITY_SLOW_API_THRESHOLD_MS` | `1000` | Slow API warning threshold |
| `OBSERVABILITY_SLOW_QUERY_MS` | `100` | Slow Prisma query threshold |
| `OBSERVABILITY_N_PLUS_ONE_COUNT` | `5` | Repeated query pattern alert |
| `LOG_DIR` | `logs` | Winston log directory |

---

## Next Steps (Priority Order)

1. Profile product list/detail under monitoring dashboard with realistic data volume.
2. Cache category tree; slim list includes.
3. Tune wallet React Query options.
4. Add DB indexes from slow query log.
5. Wire Prometheus exporter when deploying to production Kubernetes.

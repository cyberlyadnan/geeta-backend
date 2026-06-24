# Database Security — Geeta Print

## Architecture

```
Frontend (Next.js)
       ↓ HTTPS + JWT
Express.js API (sole authorization layer)
       ↓ Prisma ORM
PostgreSQL on Supabase (database hosting only)
```

**We do NOT use:**

- Supabase Auth
- Supabase Realtime
- `@supabase/supabase-js` or PostgREST from the frontend

Supabase provides **managed PostgreSQL** only. All reads/writes go through Express with JWT auth, role checks, and explicit DTO mapping.

---

## Supabase Security Advisor fixes

| Finding | Fix |
|---------|-----|
| `rls_disabled_in_public` | RLS enabled + forced on **all** public tables (dynamic migration) |
| `sensitive_columns_exposed` | RLS + revoke `anon`/`authenticated` + deny-all policies |

**Migrations:**

- `prisma/migrations/20260610120000_supabase_rls_lockdown/` — initial table list
- `prisma/migrations/20260612120000_supabase_rls_complete_lockdown/` — **dynamic** lockdown (covers new tables like `product_images`)

**One-shot (re-run after adding tables):** `npm run db:security-lockdown` or paste `scripts/supabase-rls-lockdown.sql` in Supabase SQL Editor

### Why RLS does not break Prisma

Prisma connects via `DATABASE_URL` as the `postgres` database role (superuser on Supabase). Superusers **bypass RLS**. RLS protects against accidental exposure via Supabase’s auto-generated REST API (`anon` / `authenticated` roles), not against your backend.

---

## Policy strategy

1. **ENABLE ROW LEVEL SECURITY** on every business table  
2. **FORCE ROW LEVEL SECURITY** so even table owners obey policies (defence in depth)  
3. **REVOKE ALL** on tables from `anon` and `authenticated`  
4. **RESTRICTIVE deny-all policies** for `anon` and `authenticated` (`USING (false)`)  
5. **No permissive policies** — zero rows via PostgREST for API-key clients  

`_prisma_migrations` is intentionally excluded (internal migration metadata).

---

## Sensitive table inventory

### Critical (credentials & money)

| Table | Sensitive columns | Never public |
|-------|-------------------|--------------|
| `users` | `password_hash`, `email`, `phone` | ✓ |
| `refresh_tokens` | `token` | ✓ |
| `wallets` | `balance`, totals | ✓ |
| `wallet_transactions` | amounts, balances | ✓ |
| `wallet_balance_snapshots` | `balance` | ✓ |
| `payments` | Razorpay IDs, amounts, metadata | ✓ |
| `payment_webhook_logs` | `payload`, signatures | ✓ |
| `financial_audit_logs` | amounts, audit trail | ✓ |

### High (PII & vendor)

| Table | Sensitive columns |
|-------|-------------------|
| `vendor_profiles` | GST, full address, phone, owner name |
| `vendor_compliance_*` | documents, admin remarks |
| `admin_notes` | internal content |
| `activity_logs` | IP, user agent, metadata |
| `contact_inquiries` | email, phone, message, IP |
| `contact_inquiry_notes` | internal notes |
| `file_assets` | storage keys (access via presigned URLs only) |
| `orders` / `order_items` | financial totals |
| `audit_logs` | old/new values |

### Standard (catalog & ops)

All remaining tables (products, workflow, quotes, sliders, etc.) are also under RLS — no anonymous reads.

Canonical list: `src/common/security/sensitive-data.inventory.ts`

---

## Application-layer rules

### Prisma queries

- Use **explicit `select`** for `User` — never `include: { user: true }` on API responses  
- Login uses `USER_LOGIN_SELECT` (includes `passwordHash` server-side only)  
- Session uses `USER_SESSION_SELECT` (no password fields)  

### API serialization

Central module: `src/common/security/user.serialization.ts`

**Never expose in JSON responses:**

- `password` / `passwordHash`
- `refreshTokens` / raw refresh token rows
- `payment_webhook_logs.payload`
- Internal admin notes to non-admin routes

Mappers:

- `mapUserSessionToAuthDto` — auth `/me`, login, register  
- `mapUserPublicToDto` — admin vendor user blocks  
- `mapVendorDetailToDto` — admin vendor detail  

### Frontend verification

Confirmed: **no** `@supabase/*` packages or `createClient` in `frontend/`. All data via Express API + JWT.

---

## Deploy checklist

1. Run migration: `npm run prisma:migrate:deploy` (production)  
2. Or re-run lockdown anytime: `npm run db:security-lockdown`  
3. Re-run **Security Advisor** in Supabase Dashboard (may take up to 24h to clear email alerts)  
4. Confirm Express health + login + wallet + admin vendor flows  
5. Rotate `DATABASE_URL` password if it was ever committed  

---

## Future hardening (optional)

- Dedicated non-superuser DB role for Prisma with minimal grants (RLS would then apply to app role — requires policy design per table)  
- Column-level encryption for `gst_number` at rest  
- Separate read replica for reporting  

For the current **backend-only** model, RLS + deny-all for Supabase API roles is the industry-standard approach.

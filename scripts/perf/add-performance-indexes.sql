-- Performance indexes (apply manually if prisma migrate shadow DB fails)
-- Run: npx dotenv -e .env -- prisma db execute --file scripts/perf/add-performance-indexes.sql

-- Activity logs: vendor timeline + admin feed
CREATE INDEX CONCURRENTLY IF NOT EXISTS activity_logs_vendor_profile_id_created_at_idx
  ON activity_logs (vendor_profile_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS activity_logs_entity_type_entity_id_created_at_idx
  ON activity_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS activity_logs_actor_id_created_at_idx
  ON activity_logs (actor_id, created_at DESC);

-- Refresh tokens: session revoke + lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS refresh_tokens_user_id_revoked_at_idx
  ON refresh_tokens (user_id, revoked_at);

-- Vendor admin list
CREATE INDEX CONCURRENTLY IF NOT EXISTS vendor_profiles_account_status_created_at_idx
  ON vendor_profiles (account_status, created_at DESC);

-- Production orders
CREATE INDEX CONCURRENTLY IF NOT EXISTS production_orders_customer_id_created_at_idx
  ON production_orders (customer_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS production_orders_status_created_at_idx
  ON production_orders (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS production_orders_delivery_status_idx
  ON production_orders (delivery_status);

-- Legacy orders
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_user_id_created_at_idx
  ON orders (user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_deleted_at_idx
  ON orders (deleted_at);

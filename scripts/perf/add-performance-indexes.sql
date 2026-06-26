-- Performance indexes (safe for: prisma db execute --file=... --schema=prisma/schema.prisma)
-- Note: CONCURRENTLY removed — Prisma executes in a transaction block.

CREATE INDEX IF NOT EXISTS activity_logs_vendor_profile_id_created_at_idx
  ON activity_logs (vendor_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_entity_type_entity_id_created_at_idx
  ON activity_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_actor_id_created_at_idx
  ON activity_logs (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_revoked_at_idx
  ON refresh_tokens (user_id, revoked_at);

CREATE INDEX IF NOT EXISTS vendor_profiles_account_status_created_at_idx
  ON vendor_profiles (account_status, created_at DESC);

CREATE INDEX IF NOT EXISTS production_orders_customer_id_created_at_idx
  ON production_orders (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS production_orders_status_created_at_idx
  ON production_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS production_orders_delivery_status_idx
  ON production_orders (delivery_status);

CREATE INDEX IF NOT EXISTS orders_user_id_created_at_idx
  ON orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_deleted_at_idx
  ON orders (deleted_at);

-- Partial indexes: active (non-deleted) rows only — smaller, faster list queries
CREATE INDEX IF NOT EXISTS orders_user_id_active_created_at_idx
  ON orders (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS product_offerings_active_series_idx
  ON product_offerings (series_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS slider_slides_active_key_order_idx
  ON slider_slides (slider_key, display_order)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS categories_active_parent_idx
  ON categories (parent_id, sort_order)
  WHERE deleted_at IS NULL;

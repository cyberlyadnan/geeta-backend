-- Vendor order creation system: sequences, drafts, events, snapshots, notifications

ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ORDER_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ORDER_WALLET_CHARGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ORDER_DRAFT_SAVED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ORDER_STATUS_CHANGED';

ALTER TYPE "ProductionOrderStatus" ADD VALUE IF NOT EXISTS 'ORDER_PLACED';
ALTER TYPE "ProductionOrderStatus" ADD VALUE IF NOT EXISTS 'UNDER_ARTWORK_REVIEW';
ALTER TYPE "ProductionOrderStatus" ADD VALUE IF NOT EXISTS 'ARTWORK_APPROVED';
ALTER TYPE "ProductionOrderStatus" ADD VALUE IF NOT EXISTS 'QUALITY_CHECK';
ALTER TYPE "ProductionOrderStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_DISPATCH';

CREATE TABLE IF NOT EXISTS "order_number_sequences" (
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "order_number_sequences_pkey" PRIMARY KEY ("year")
);

ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "wallet_deducted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "estimated_completion_at" TIMESTAMP(3);
ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "source_draft_id" TEXT;

ALTER TABLE "production_order_items" ADD COLUMN IF NOT EXISTS "product_snapshot" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "production_order_items" ADD COLUMN IF NOT EXISTS "configuration_snapshot" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "production_order_items" ADD COLUMN IF NOT EXISTS "size_snapshot" JSONB;
ALTER TABLE "production_order_items" ADD COLUMN IF NOT EXISTS "validation_snapshot" JSONB;
ALTER TABLE "production_order_items" ADD COLUMN IF NOT EXISTS "coverage_snapshot" JSONB;

CREATE TABLE IF NOT EXISTS "production_order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "production_order_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vendor_order_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "step" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_order_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "production_order_id" TEXT;

CREATE INDEX IF NOT EXISTS "production_order_events_order_id_created_at_idx" ON "production_order_events"("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "vendor_order_drafts_user_id_updated_at_idx" ON "vendor_order_drafts"("user_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "user_notifications_user_id_is_read_created_at_idx" ON "user_notifications"("user_id", "is_read", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "wallet_transactions_production_order_id_idx" ON "wallet_transactions"("production_order_id");

ALTER TABLE "production_order_events" ADD CONSTRAINT "production_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_order_events" ADD CONSTRAINT "production_order_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendor_order_drafts" ADD CONSTRAINT "vendor_order_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

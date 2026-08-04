-- Phase 1 order flexibility: order amendments, retail customers, admin-created orders.
-- See docs/features/03-phase1-order-flexibility.md and phase1-order-flexibility-as-built.md.

ALTER TABLE "workflow_template_steps"
  ADD COLUMN "locks_amendments_on_start" BOOLEAN NOT NULL DEFAULT false;

-- 1B: RetailCustomer — walk-in customer with no vendor account, looked up by phone.
CREATE TABLE "retail_customers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "has_gst" BOOLEAN NOT NULL DEFAULT false,
  "gst_number" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "retail_customers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "retail_customers_phone_idx" ON "retail_customers"("phone");

ALTER TABLE "retail_customers"
  ADD CONSTRAINT "retail_customers_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- production_orders: customer_id becomes optional, order belongs to a vendor OR a retail
-- customer, never both/neither (enforced by CHECK below), plus who created it on their behalf.
ALTER TABLE "production_orders"
  ALTER COLUMN "customer_id" DROP NOT NULL;

ALTER TABLE "production_orders"
  ADD COLUMN "retail_customer_id" TEXT,
  ADD COLUMN "created_by_actor_id" TEXT;

CREATE INDEX "production_orders_retail_customer_id_idx" ON "production_orders"("retail_customer_id");
CREATE INDEX "production_orders_created_by_actor_id_idx" ON "production_orders"("created_by_actor_id");

ALTER TABLE "production_orders"
  ADD CONSTRAINT "production_orders_retail_customer_id_fkey"
  FOREIGN KEY ("retail_customer_id") REFERENCES "retail_customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_orders"
  ADD CONSTRAINT "production_orders_created_by_actor_id_fkey"
  FOREIGN KEY ("created_by_actor_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "production_orders"
  ADD CONSTRAINT "production_orders_customer_xor_retail_customer_check"
  CHECK (
    ("customer_id" IS NOT NULL AND "retail_customer_id" IS NULL) OR
    ("customer_id" IS NULL AND "retail_customer_id" IS NOT NULL)
  );

-- 1A: OrderAmendment — immutable audit record; previous_snapshot_id/new_snapshot_id both point
-- at real, untouched PriceSnapshot rows. new_snapshot_id is unique — a PriceSnapshot is the
-- "new" side of at most one amendment.
CREATE TABLE "order_amendments" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "amended_by_user_id" TEXT NOT NULL,
  "reason" TEXT,
  "previous_config" JSONB NOT NULL,
  "new_config" JSONB NOT NULL,
  "previous_snapshot_id" TEXT NOT NULL,
  "new_snapshot_id" TEXT NOT NULL,
  "price_delta" DECIMAL(12, 2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_amendments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_amendments_new_snapshot_id_key" ON "order_amendments"("new_snapshot_id");
CREATE INDEX "order_amendments_order_id_created_at_idx" ON "order_amendments"("order_id", "created_at" DESC);

ALTER TABLE "order_amendments"
  ADD CONSTRAINT "order_amendments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "production_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_amendments"
  ADD CONSTRAINT "order_amendments_amended_by_user_id_fkey"
  FOREIGN KEY ("amended_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_amendments"
  ADD CONSTRAINT "order_amendments_previous_snapshot_id_fkey"
  FOREIGN KEY ("previous_snapshot_id") REFERENCES "price_snapshots"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_amendments"
  ADD CONSTRAINT "order_amendments_new_snapshot_id_fkey"
  FOREIGN KEY ("new_snapshot_id") REFERENCES "price_snapshots"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

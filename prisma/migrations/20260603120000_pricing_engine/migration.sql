-- Product Engine Phase 3 — Pricing Engine

CREATE TYPE "PricingAdjustmentType" AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE "PricingRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "quantity_pricing" (
    "id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "base_price" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quantity_pricing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "configuration_option_pricing" (
    "id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "adjustment_type" "PricingAdjustmentType" NOT NULL,
    "adjustment_value" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "configuration_option_pricing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "condition" JSONB NOT NULL,
    "adjustment_type" "PricingAdjustmentType" NOT NULL,
    "adjustment_value" DECIMAL(12,2) NOT NULL,
    "status" "PricingRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_snapshots" (
    "id" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "adjustment_total" DECIMAL(12,2) NOT NULL,
    "discount_total" DECIMAL(12,2) NOT NULL,
    "tax_total" DECIMAL(12,2) NOT NULL,
    "grand_total" DECIMAL(12,2) NOT NULL,
    "calculation" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quantity_pricing_offering_id_quantity_key"
    ON "quantity_pricing"("offering_id", "quantity");
CREATE INDEX "quantity_pricing_offering_id_idx"
    ON "quantity_pricing"("offering_id");

CREATE UNIQUE INDEX "configuration_option_pricing_option_id_key"
    ON "configuration_option_pricing"("option_id");

CREATE INDEX "pricing_rules_offering_id_idx"
    ON "pricing_rules"("offering_id");
CREATE INDEX "pricing_rules_status_idx"
    ON "pricing_rules"("status");

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "price_snapshot_id" TEXT;
CREATE INDEX IF NOT EXISTS "order_items_price_snapshot_id_idx" ON "order_items"("price_snapshot_id");

ALTER TABLE "quantity_pricing"
    ADD CONSTRAINT "quantity_pricing_offering_id_fkey"
    FOREIGN KEY ("offering_id") REFERENCES "product_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "configuration_option_pricing"
    ADD CONSTRAINT "configuration_option_pricing_option_id_fkey"
    FOREIGN KEY ("option_id") REFERENCES "configuration_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pricing_rules"
    ADD CONSTRAINT "pricing_rules_offering_id_fkey"
    FOREIGN KEY ("offering_id") REFERENCES "product_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_items"
    ADD CONSTRAINT "order_items_price_snapshot_id_fkey"
    FOREIGN KEY ("price_snapshot_id") REFERENCES "price_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

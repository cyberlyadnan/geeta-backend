-- Extend configuration option pricing with strategy-based pricing.

CREATE TYPE "OptionPricingStrategy" AS ENUM (
  'FIXED',
  'QUANTITY_BASED',
  'AREA_BASED',
  'PER_SHEET',
  'PERCENTAGE',
  'FORMULA',
  'PER_PIECE',
  'PER_BOX',
  'CUSTOM'
);

ALTER TABLE "configuration_option_pricing"
  ADD COLUMN "pricing_strategy" "OptionPricingStrategy" NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "strategy_config" JSONB NOT NULL DEFAULT '{}';

-- Map legacy adjustment types to strategies.
UPDATE "configuration_option_pricing"
SET "pricing_strategy" = 'PERCENTAGE'
WHERE "adjustment_type" = 'PERCENTAGE';

UPDATE "configuration_option_pricing"
SET "pricing_strategy" = 'FIXED'
WHERE "adjustment_type" = 'FIXED';

CREATE TABLE "configuration_option_quantity_pricing" (
  "id" TEXT NOT NULL,
  "option_pricing_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "price" DECIMAL(12, 2) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "configuration_option_quantity_pricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuration_option_quantity_pricing_option_pricing_id_quantity_key"
  ON "configuration_option_quantity_pricing"("option_pricing_id", "quantity");

CREATE INDEX "configuration_option_quantity_pricing_option_pricing_id_idx"
  ON "configuration_option_quantity_pricing"("option_pricing_id");

ALTER TABLE "configuration_option_quantity_pricing"
  ADD CONSTRAINT "configuration_option_quantity_pricing_option_pricing_id_fkey"
  FOREIGN KEY ("option_pricing_id") REFERENCES "configuration_option_pricing"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

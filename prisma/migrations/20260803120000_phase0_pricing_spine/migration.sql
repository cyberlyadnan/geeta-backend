-- Phase 0 pricing spine: matrix pricing, roll/flex chargeable-size engine, vendor overrides.
-- See docs/features/02-phase0-pricing-spine.md and phase0-pricing-spine-as-built.md.

CREATE TYPE "VendorPriceOverrideType" AS ENUM (
  'REPLACE',
  'DELTA'
);

ALTER TABLE "product_offering_versions"
  ADD COLUMN "rate_per_sq_ft" DECIMAL(12, 2);

-- 0A: Matrix Pricing Strategy
-- dimension_key is kept for readability; dimension_key_hash (canonical sorted string) is what
-- uniqueness and lookups key off, since Postgres has no default btree operator class for jsonb.
CREATE TABLE "price_matrix_cells" (
  "id" TEXT NOT NULL,
  "product_offering_version_id" TEXT NOT NULL,
  "dimension_key" JSONB NOT NULL,
  "dimension_key_hash" TEXT NOT NULL,
  "price" DECIMAL(12, 2),
  "available" BOOLEAN NOT NULL DEFAULT true,
  "unavailable_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "price_matrix_cells_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "price_matrix_cells_product_offering_version_id_dimension_key_hash_key"
  ON "price_matrix_cells"("product_offering_version_id", "dimension_key_hash");

CREATE INDEX "price_matrix_cells_product_offering_version_id_idx"
  ON "price_matrix_cells"("product_offering_version_id");

ALTER TABLE "price_matrix_cells"
  ADD CONSTRAINT "price_matrix_cells_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Conditional surcharge on top of a matrix (or quantity-tier) base price, e.g. B/S surcharge.
CREATE TABLE "price_modifier_rules" (
  "id" TEXT NOT NULL,
  "product_offering_version_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "trigger_field" TEXT NOT NULL,
  "trigger_value" TEXT NOT NULL,
  "amount_key" TEXT NOT NULL,
  "amount_table" JSONB NOT NULL,
  "applies_after" TEXT NOT NULL DEFAULT 'base',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "price_modifier_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "price_modifier_rules_product_offering_version_id_idx"
  ON "price_modifier_rules"("product_offering_version_id");

ALTER TABLE "price_modifier_rules"
  ADD CONSTRAINT "price_modifier_rules_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 0B: Roll/Flex Chargeable-Size Engine
CREATE TABLE "roll_width_options" (
  "id" TEXT NOT NULL,
  "product_offering_version_id" TEXT NOT NULL,
  "width_feet" DECIMAL(6, 2) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "roll_width_options_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roll_width_options_product_offering_version_id_width_feet_key"
  ON "roll_width_options"("product_offering_version_id", "width_feet");

CREATE INDEX "roll_width_options_product_offering_version_id_idx"
  ON "roll_width_options"("product_offering_version_id");

ALTER TABLE "roll_width_options"
  ADD CONSTRAINT "roll_width_options_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 0C: Vendor Price Overrides
-- Sparse by design: only negotiated cells/products get a row; everything else falls through
-- to the default (list) price.
CREATE TABLE "vendor_price_overrides" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "product_offering_version_id" TEXT NOT NULL,
  "matrix_cell_id" TEXT,
  "override_type" "VendorPriceOverrideType" NOT NULL,
  "value" DECIMAL(12, 2) NOT NULL,
  "set_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vendor_price_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendor_price_overrides_vendor_id_product_offering_version_id_idx"
  ON "vendor_price_overrides"("vendor_id", "product_offering_version_id");

CREATE INDEX "vendor_price_overrides_product_offering_version_id_idx"
  ON "vendor_price_overrides"("product_offering_version_id");

CREATE INDEX "vendor_price_overrides_matrix_cell_id_idx"
  ON "vendor_price_overrides"("matrix_cell_id");

-- Partial unique indexes instead of a single @@unique([vendorId, versionId, matrixCellId]):
-- Postgres does not collapse NULLs in a compound unique constraint, so a plain unique index
-- would let two "whole-product" overrides (matrixCellId IS NULL) exist for the same
-- vendor+product. These are not representable in schema.prisma without the extendedIndexes
-- preview feature, so they must be preserved by hand in any future migration that touches
-- this table.
CREATE UNIQUE INDEX "vendor_price_overrides_cell_unique"
  ON "vendor_price_overrides"("vendor_id", "product_offering_version_id", "matrix_cell_id")
  WHERE "matrix_cell_id" IS NOT NULL;

CREATE UNIQUE INDEX "vendor_price_overrides_whole_product_unique"
  ON "vendor_price_overrides"("vendor_id", "product_offering_version_id")
  WHERE "matrix_cell_id" IS NULL;

ALTER TABLE "vendor_price_overrides"
  ADD CONSTRAINT "vendor_price_overrides_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_price_overrides"
  ADD CONSTRAINT "vendor_price_overrides_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_price_overrides"
  ADD CONSTRAINT "vendor_price_overrides_matrix_cell_id_fkey"
  FOREIGN KEY ("matrix_cell_id") REFERENCES "price_matrix_cells"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_price_overrides"
  ADD CONSTRAINT "vendor_price_overrides_set_by_user_id_fkey"
  FOREIGN KEY ("set_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

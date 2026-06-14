-- Product Catalog ERP extensions: nested categories, visibility, images, pricing rule links

-- CreateEnum
CREATE TYPE "ProductVisibility" AS ENUM ('PUBLIC', 'VENDOR_ONLY', 'HIDDEN');

-- AlterEnum ActivityAction
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRODUCT_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRODUCT_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRODUCT_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRODUCT_PRICING_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRODUCT_ATTRIBUTE_ADDED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRODUCT_ATTRIBUTE_REMOVED';

-- Category hierarchy
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "parent_id" TEXT;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "image_key" TEXT;
CREATE INDEX IF NOT EXISTS "categories_parent_id_idx" ON "categories"("parent_id");
DO $$ BEGIN
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Product offering visibility & thumbnail
ALTER TABLE "product_offerings" ADD COLUMN IF NOT EXISTS "thumbnail_url" TEXT;
ALTER TABLE "product_offerings" ADD COLUMN IF NOT EXISTS "thumbnail_key" TEXT;
ALTER TABLE "product_offerings" ADD COLUMN IF NOT EXISTS "visibility" "ProductVisibility" NOT NULL DEFAULT 'VENDOR_ONLY';
CREATE INDEX IF NOT EXISTS "product_offerings_visibility_idx" ON "product_offerings"("visibility");

-- Product images
CREATE TABLE IF NOT EXISTS "product_images" (
    "id" TEXT NOT NULL,
    "product_offering_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_key" TEXT NOT NULL,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_thumbnail" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "product_images_product_offering_id_idx" ON "product_images"("product_offering_id");
CREATE INDEX IF NOT EXISTS "product_images_sort_order_idx" ON "product_images"("sort_order");
DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_offering_id_fkey"
    FOREIGN KEY ("product_offering_id") REFERENCES "product_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Pricing rules: attribute linkage + priority
ALTER TABLE "pricing_rules" ADD COLUMN IF NOT EXISTS "configuration_field_id" TEXT;
ALTER TABLE "pricing_rules" ADD COLUMN IF NOT EXISTS "configuration_option_id" TEXT;
ALTER TABLE "pricing_rules" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pricing_rules" ALTER COLUMN "condition" SET DEFAULT '{}';
CREATE INDEX IF NOT EXISTS "pricing_rules_configuration_field_id_idx" ON "pricing_rules"("configuration_field_id");
CREATE INDEX IF NOT EXISTS "pricing_rules_configuration_option_id_idx" ON "pricing_rules"("configuration_option_id");
CREATE INDEX IF NOT EXISTS "pricing_rules_priority_idx" ON "pricing_rules"("priority");
DO $$ BEGIN
  ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_configuration_field_id_fkey"
    FOREIGN KEY ("configuration_field_id") REFERENCES "configuration_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_configuration_option_id_fkey"
    FOREIGN KEY ("configuration_option_id") REFERENCES "configuration_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Product Engine Phase 1 — Printing ERP Foundation
-- Category → ProductFamily → ProductSeries → ProductOffering → ProductOfferingVersion

-- Enums
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "ProductOfferingVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED', 'ARCHIVED');

-- Categories (simplify — drop hierarchy columns if present)
ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_parent_id_fkey";
DROP INDEX IF EXISTS "categories_parent_id_idx";
DROP INDEX IF EXISTS "categories_code_key";
ALTER TABLE "categories" DROP COLUMN IF EXISTS "parent_id";
ALTER TABLE "categories" DROP COLUMN IF EXISTS "code";
ALTER TABLE "categories" DROP COLUMN IF EXISTS "metadata";
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "categories" ALTER COLUMN "description" TYPE TEXT;

CREATE INDEX IF NOT EXISTS "categories_is_active_deleted_at_idx" ON "categories"("is_active", "deleted_at");
CREATE INDEX IF NOT EXISTS "categories_sort_order_idx" ON "categories"("sort_order");

-- Order items: migrate off legacy products
ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_product_id_fkey";
DROP INDEX IF EXISTS "order_items_product_id_idx";
ALTER TABLE "order_items" DROP COLUMN IF EXISTS "product_id";
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "product_offering_version_id" TEXT;

DROP TABLE IF EXISTS "products";

-- Drop legacy product engine tables if re-running
DROP TABLE IF EXISTS "product_offering_versions" CASCADE;
DROP TABLE IF EXISTS "product_offerings" CASCADE;
DROP TABLE IF EXISTS "product_series" CASCADE;
DROP TABLE IF EXISTS "product_families" CASCADE;

-- ProductFamily
CREATE TABLE "product_families" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "product_families_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_families_slug_key" ON "product_families"("slug");
CREATE INDEX "product_families_category_id_idx" ON "product_families"("category_id");
CREATE INDEX "product_families_status_idx" ON "product_families"("status");
CREATE INDEX "product_families_is_active_deleted_at_idx" ON "product_families"("is_active", "deleted_at");

-- ProductSeries
CREATE TABLE "product_series" (
    "id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "product_code" TEXT,
    "production_days" INTEGER,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "product_series_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_series_slug_key" ON "product_series"("slug");
CREATE UNIQUE INDEX "product_series_product_code_key" ON "product_series"("product_code");
CREATE INDEX "product_series_family_id_idx" ON "product_series"("family_id");
CREATE INDEX "product_series_status_idx" ON "product_series"("status");
CREATE INDEX "product_series_is_active_deleted_at_idx" ON "product_series"("is_active", "deleted_at");

-- ProductOffering
CREATE TABLE "product_offerings" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "short_description" TEXT,
    "description" TEXT,
    "sku" TEXT,
    "display_name" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "product_offerings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_offerings_slug_key" ON "product_offerings"("slug");
CREATE UNIQUE INDEX "product_offerings_sku_key" ON "product_offerings"("sku");
CREATE INDEX "product_offerings_series_id_idx" ON "product_offerings"("series_id");
CREATE INDEX "product_offerings_status_idx" ON "product_offerings"("status");
CREATE INDEX "product_offerings_is_active_deleted_at_idx" ON "product_offerings"("is_active", "deleted_at");

-- ProductOfferingVersion
CREATE TABLE "product_offering_versions" (
    "id" TEXT NOT NULL,
    "product_offering_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_label" TEXT NOT NULL,
    "status" "ProductOfferingVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "changelog" TEXT,
    "pricing_profile_key" TEXT,
    "workflow_key" TEXT,
    "configuration_schema" JSONB NOT NULL DEFAULT '{}',
    "file_requirements" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "product_offering_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_offering_versions_product_offering_id_version_number_key"
    ON "product_offering_versions"("product_offering_id", "version_number");
CREATE INDEX "product_offering_versions_product_offering_id_status_deleted_at_idx"
    ON "product_offering_versions"("product_offering_id", "status", "deleted_at");
CREATE INDEX "product_offering_versions_product_offering_id_is_current_idx"
    ON "product_offering_versions"("product_offering_id", "is_current");
CREATE INDEX "product_offering_versions_effective_from_effective_to_idx"
    ON "product_offering_versions"("effective_from", "effective_to");

CREATE INDEX IF NOT EXISTS "order_items_product_offering_version_id_idx"
    ON "order_items"("product_offering_version_id");

-- Foreign keys
ALTER TABLE "product_families"
    ADD CONSTRAINT "product_families_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_series"
    ADD CONSTRAINT "product_series_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "product_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_offerings"
    ADD CONSTRAINT "product_offerings_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "product_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_offering_versions"
    ADD CONSTRAINT "product_offering_versions_product_offering_id_fkey"
    FOREIGN KEY ("product_offering_id") REFERENCES "product_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_items"
    ADD CONSTRAINT "order_items_product_offering_version_id_fkey"
    FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

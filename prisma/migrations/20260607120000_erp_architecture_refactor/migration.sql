-- ERP Architecture Refactor
-- Version-scoped product definition, quotation engine, audit, machines, job cards, BOM foundation.

-- ─── New enums ───────────────────────────────────────────────────────────────

CREATE TYPE "QuoteStatus" AS ENUM (
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED'
);

CREATE TYPE "MachineStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'MAINTENANCE',
  'DECOMMISSIONED'
);

CREATE TYPE "ProductionJobCardStatus" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "MaterialStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- Helper: resolve version for an offering (prefer is_current, else latest)
CREATE OR REPLACE FUNCTION _resolve_offering_version(p_offering_id TEXT)
RETURNS TEXT AS $$
  SELECT id FROM product_offering_versions
  WHERE product_offering_id = p_offering_id
  ORDER BY is_current DESC, version_number DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ─── PRIORITY 1: Move product definition FKs to ProductOfferingVersion ───────

-- configuration_groups
ALTER TABLE "configuration_groups" ADD COLUMN "product_offering_version_id" TEXT;
UPDATE "configuration_groups"
SET "product_offering_version_id" = _resolve_offering_version("offering_id");
ALTER TABLE "configuration_groups" ALTER COLUMN "product_offering_version_id" SET NOT NULL;
ALTER TABLE "configuration_groups" DROP CONSTRAINT IF EXISTS "configuration_groups_offering_id_fkey";
DROP INDEX IF EXISTS "configuration_groups_offering_id_code_key";
DROP INDEX IF EXISTS "configuration_groups_offering_id_idx";
ALTER TABLE "configuration_groups" DROP COLUMN "offering_id";
CREATE UNIQUE INDEX "configuration_groups_product_offering_version_id_code_key"
  ON "configuration_groups"("product_offering_version_id", "code");
CREATE INDEX "configuration_groups_product_offering_version_id_idx"
  ON "configuration_groups"("product_offering_version_id");
ALTER TABLE "configuration_groups"
  ADD CONSTRAINT "configuration_groups_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- configuration_fields
ALTER TABLE "configuration_fields" ADD COLUMN "product_offering_version_id" TEXT;
UPDATE "configuration_fields"
SET "product_offering_version_id" = _resolve_offering_version("offering_id");
ALTER TABLE "configuration_fields" ALTER COLUMN "product_offering_version_id" SET NOT NULL;
ALTER TABLE "configuration_fields" DROP CONSTRAINT IF EXISTS "configuration_fields_offering_id_fkey";
DROP INDEX IF EXISTS "configuration_fields_offering_id_code_key";
DROP INDEX IF EXISTS "configuration_fields_offering_id_idx";
ALTER TABLE "configuration_fields" DROP COLUMN "offering_id";
CREATE UNIQUE INDEX "configuration_fields_product_offering_version_id_code_key"
  ON "configuration_fields"("product_offering_version_id", "code");
CREATE INDEX "configuration_fields_product_offering_version_id_idx"
  ON "configuration_fields"("product_offering_version_id");
ALTER TABLE "configuration_fields"
  ADD CONSTRAINT "configuration_fields_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PRIORITY 6: configuration_rules — JSON condition engine
ALTER TABLE "configuration_rules" ADD COLUMN "product_offering_version_id" TEXT;
ALTER TABLE "configuration_rules" ADD COLUMN "condition" JSONB;
ALTER TABLE "configuration_rules" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "configuration_rules" ADD COLUMN "updated_at" TIMESTAMP(3);

UPDATE "configuration_rules" cr
SET
  "product_offering_version_id" = tf."product_offering_version_id",
  "condition" = jsonb_build_object(
    'field', sf."code",
    'operator', '=',
    'value', so."value"
  ),
  "updated_at" = cr."created_at"
FROM "configuration_fields" tf
JOIN "configuration_fields" sf ON sf."id" = cr."source_field_id"
JOIN "configuration_options" so ON so."id" = cr."source_option_id"
WHERE tf."id" = cr."target_field_id";

DELETE FROM "configuration_rules" WHERE "product_offering_version_id" IS NULL;

ALTER TABLE "configuration_rules" ALTER COLUMN "product_offering_version_id" SET NOT NULL;
ALTER TABLE "configuration_rules" ALTER COLUMN "condition" SET NOT NULL;
ALTER TABLE "configuration_rules" ALTER COLUMN "updated_at" SET NOT NULL;

ALTER TABLE "configuration_rules" DROP CONSTRAINT IF EXISTS "configuration_rules_source_field_id_fkey";
ALTER TABLE "configuration_rules" DROP CONSTRAINT IF EXISTS "configuration_rules_source_option_id_fkey";
DROP INDEX IF EXISTS "configuration_rules_source_field_id_idx";
DROP INDEX IF EXISTS "configuration_rules_source_option_id_idx";
ALTER TABLE "configuration_rules" DROP COLUMN "source_field_id";
ALTER TABLE "configuration_rules" DROP COLUMN "source_option_id";

CREATE INDEX "configuration_rules_product_offering_version_id_idx"
  ON "configuration_rules"("product_offering_version_id");
ALTER TABLE "configuration_rules"
  ADD CONSTRAINT "configuration_rules_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- quantity_pricing
ALTER TABLE "quantity_pricing" ADD COLUMN "product_offering_version_id" TEXT;
UPDATE "quantity_pricing"
SET "product_offering_version_id" = _resolve_offering_version("offering_id");
ALTER TABLE "quantity_pricing" ALTER COLUMN "product_offering_version_id" SET NOT NULL;
ALTER TABLE "quantity_pricing" DROP CONSTRAINT IF EXISTS "quantity_pricing_offering_id_fkey";
DROP INDEX IF EXISTS "quantity_pricing_offering_id_quantity_key";
DROP INDEX IF EXISTS "quantity_pricing_offering_id_idx";
ALTER TABLE "quantity_pricing" DROP COLUMN "offering_id";
CREATE UNIQUE INDEX "quantity_pricing_product_offering_version_id_quantity_key"
  ON "quantity_pricing"("product_offering_version_id", "quantity");
CREATE INDEX "quantity_pricing_product_offering_version_id_idx"
  ON "quantity_pricing"("product_offering_version_id");
ALTER TABLE "quantity_pricing"
  ADD CONSTRAINT "quantity_pricing_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- pricing_rules
ALTER TABLE "pricing_rules" ADD COLUMN "product_offering_version_id" TEXT;
UPDATE "pricing_rules"
SET "product_offering_version_id" = _resolve_offering_version("offering_id");
ALTER TABLE "pricing_rules" ALTER COLUMN "product_offering_version_id" SET NOT NULL;
ALTER TABLE "pricing_rules" DROP CONSTRAINT IF EXISTS "pricing_rules_offering_id_fkey";
DROP INDEX IF EXISTS "pricing_rules_offering_id_idx";
ALTER TABLE "pricing_rules" DROP COLUMN "offering_id";
CREATE INDEX "pricing_rules_product_offering_version_id_idx"
  ON "pricing_rules"("product_offering_version_id");
ALTER TABLE "pricing_rules"
  ADD CONSTRAINT "pricing_rules_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- file_requirements
ALTER TABLE "file_requirements" ADD COLUMN "product_offering_version_id" TEXT;
UPDATE "file_requirements"
SET "product_offering_version_id" = _resolve_offering_version("offering_id");
ALTER TABLE "file_requirements" ALTER COLUMN "product_offering_version_id" SET NOT NULL;
ALTER TABLE "file_requirements" DROP CONSTRAINT IF EXISTS "file_requirements_offering_id_fkey";
DROP INDEX IF EXISTS "file_requirements_offering_id_code_key";
DROP INDEX IF EXISTS "file_requirements_offering_id_idx";
ALTER TABLE "file_requirements" DROP COLUMN "offering_id";
CREATE UNIQUE INDEX "file_requirements_product_offering_version_id_code_key"
  ON "file_requirements"("product_offering_version_id", "code");
CREATE INDEX "file_requirements_product_offering_version_id_idx"
  ON "file_requirements"("product_offering_version_id");
ALTER TABLE "file_requirements"
  ADD CONSTRAINT "file_requirements_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PRIORITY 3: product_offering_workflows
ALTER TABLE "product_offering_workflows" ADD COLUMN "product_offering_version_id" TEXT;
UPDATE "product_offering_workflows"
SET "product_offering_version_id" = _resolve_offering_version("offering_id");
ALTER TABLE "product_offering_workflows" ALTER COLUMN "product_offering_version_id" SET NOT NULL;
ALTER TABLE "product_offering_workflows" DROP CONSTRAINT IF EXISTS "product_offering_workflows_offering_id_fkey";
DROP INDEX IF EXISTS "product_offering_workflows_offering_id_key";
ALTER TABLE "product_offering_workflows" DROP COLUMN "offering_id";
CREATE UNIQUE INDEX "product_offering_workflows_product_offering_version_id_key"
  ON "product_offering_workflows"("product_offering_version_id");
ALTER TABLE "product_offering_workflows"
  ADD CONSTRAINT "product_offering_workflows_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PRIORITY 2: production_order_items
ALTER TABLE "production_order_items" ADD COLUMN "product_offering_version_id" TEXT;
UPDATE "production_order_items"
SET "product_offering_version_id" = _resolve_offering_version("offering_id")
WHERE "offering_id" IS NOT NULL;
ALTER TABLE "production_order_items" ALTER COLUMN "product_offering_version_id" SET NOT NULL;
ALTER TABLE "production_order_items" DROP CONSTRAINT IF EXISTS "production_order_items_offering_id_fkey";
DROP INDEX IF EXISTS "production_order_items_offering_id_idx";
ALTER TABLE "production_order_items" DROP COLUMN "offering_id";
CREATE INDEX "production_order_items_product_offering_version_id_idx"
  ON "production_order_items"("product_offering_version_id");
ALTER TABLE "production_order_items"
  ADD CONSTRAINT "production_order_items_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP FUNCTION _resolve_offering_version(TEXT);

-- ─── PRIORITY 7: Machines + task assignment ──────────────────────────────────

CREATE TABLE "machines" (
  "id" TEXT NOT NULL,
  "facility_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "machine_code" TEXT NOT NULL,
  "machine_name" TEXT NOT NULL,
  "status" "MachineStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "machines_machine_code_key" ON "machines"("machine_code");
CREATE INDEX "machines_facility_id_idx" ON "machines"("facility_id");
CREATE INDEX "machines_department_id_idx" ON "machines"("department_id");
CREATE INDEX "machines_status_idx" ON "machines"("status");

ALTER TABLE "machines"
  ADD CONSTRAINT "machines_facility_id_fkey"
  FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "machines"
  ADD CONSTRAINT "machines_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_tasks" ADD COLUMN "assigned_department_id" TEXT;
ALTER TABLE "workflow_tasks" ADD COLUMN "assigned_machine_id" TEXT;

CREATE INDEX "workflow_tasks_assigned_department_id_idx"
  ON "workflow_tasks"("assigned_department_id");
CREATE INDEX "workflow_tasks_assigned_machine_id_idx"
  ON "workflow_tasks"("assigned_machine_id");

ALTER TABLE "workflow_tasks"
  ADD CONSTRAINT "workflow_tasks_assigned_department_id_fkey"
  FOREIGN KEY ("assigned_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_tasks"
  ADD CONSTRAINT "workflow_tasks_assigned_machine_id_fkey"
  FOREIGN KEY ("assigned_machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── PRIORITY 4: Quotation engine ────────────────────────────────────────────

CREATE TABLE "quotes" (
  "id" TEXT NOT NULL,
  "quote_number" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "subtotal" DECIMAL(12,2) NOT NULL,
  "tax_amount" DECIMAL(12,2) NOT NULL,
  "total_amount" DECIMAL(12,2) NOT NULL,
  "validity_date" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_items" (
  "id" TEXT NOT NULL,
  "quote_id" TEXT NOT NULL,
  "product_offering_version_id" TEXT NOT NULL,
  "price_snapshot_id" TEXT,
  "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "total_price" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quotes_quote_number_key" ON "quotes"("quote_number");
CREATE INDEX "quotes_customer_id_idx" ON "quotes"("customer_id");
CREATE INDEX "quotes_status_idx" ON "quotes"("status");
CREATE INDEX "quotes_validity_date_idx" ON "quotes"("validity_date");
CREATE INDEX "quote_items_quote_id_idx" ON "quote_items"("quote_id");
CREATE INDEX "quote_items_product_offering_version_id_idx" ON "quote_items"("product_offering_version_id");
CREATE INDEX "quote_items_price_snapshot_id_idx" ON "quote_items"("price_snapshot_id");

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_items"
  ADD CONSTRAINT "quote_items_quote_id_fkey"
  FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_items"
  ADD CONSTRAINT "quote_items_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_items"
  ADD CONSTRAINT "quote_items_price_snapshot_id_fkey"
  FOREIGN KEY ("price_snapshot_id") REFERENCES "price_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── PRIORITY 8: Job cards ───────────────────────────────────────────────────

CREATE TABLE "production_job_cards" (
  "id" TEXT NOT NULL,
  "job_card_number" TEXT NOT NULL,
  "production_order_id" TEXT NOT NULL,
  "production_order_item_id" TEXT NOT NULL,
  "workflow_instance_id" TEXT NOT NULL,
  "current_step" INTEGER NOT NULL DEFAULT 1,
  "status" "ProductionJobCardStatus" NOT NULL DEFAULT 'PENDING',
  "qr_code" TEXT NOT NULL,
  "remarks" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_job_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_job_cards_job_card_number_key"
  ON "production_job_cards"("job_card_number");
CREATE UNIQUE INDEX "production_job_cards_qr_code_key"
  ON "production_job_cards"("qr_code");
CREATE INDEX "production_job_cards_production_order_id_idx"
  ON "production_job_cards"("production_order_id");
CREATE INDEX "production_job_cards_production_order_item_id_idx"
  ON "production_job_cards"("production_order_item_id");
CREATE INDEX "production_job_cards_workflow_instance_id_idx"
  ON "production_job_cards"("workflow_instance_id");
CREATE INDEX "production_job_cards_status_idx"
  ON "production_job_cards"("status");

ALTER TABLE "production_job_cards"
  ADD CONSTRAINT "production_job_cards_production_order_id_fkey"
  FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_job_cards"
  ADD CONSTRAINT "production_job_cards_production_order_item_id_fkey"
  FOREIGN KEY ("production_order_item_id") REFERENCES "production_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_job_cards"
  ADD CONSTRAINT "production_job_cards_workflow_instance_id_fkey"
  FOREIGN KEY ("workflow_instance_id") REFERENCES "workflow_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── PRIORITY 9: Inventory & BOM foundation ──────────────────────────────────

CREATE TABLE "material_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "material_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "materials" (
  "id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "status" "MaterialStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bom_templates" (
  "id" TEXT NOT NULL,
  "product_offering_version_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bom_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bom_template_items" (
  "id" TEXT NOT NULL,
  "bom_template_id" TEXT NOT NULL,
  "material_id" TEXT NOT NULL,
  "quantity" DECIMAL(14,4) NOT NULL,
  "unit" TEXT,
  "notes" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "bom_template_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "material_categories_code_key" ON "material_categories"("code");
CREATE INDEX "material_categories_is_active_idx" ON "material_categories"("is_active");
CREATE UNIQUE INDEX "materials_code_key" ON "materials"("code");
CREATE INDEX "materials_category_id_idx" ON "materials"("category_id");
CREATE INDEX "materials_status_idx" ON "materials"("status");
CREATE UNIQUE INDEX "bom_templates_product_offering_version_id_key"
  ON "bom_templates"("product_offering_version_id");
CREATE INDEX "bom_templates_code_idx" ON "bom_templates"("code");
CREATE UNIQUE INDEX "bom_template_items_bom_template_id_material_id_key"
  ON "bom_template_items"("bom_template_id", "material_id");
CREATE INDEX "bom_template_items_bom_template_id_idx" ON "bom_template_items"("bom_template_id");
CREATE INDEX "bom_template_items_material_id_idx" ON "bom_template_items"("material_id");

ALTER TABLE "materials"
  ADD CONSTRAINT "materials_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "material_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bom_templates"
  ADD CONSTRAINT "bom_templates_product_offering_version_id_fkey"
  FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bom_template_items"
  ADD CONSTRAINT "bom_template_items_bom_template_id_fkey"
  FOREIGN KEY ("bom_template_id") REFERENCES "bom_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bom_template_items"
  ADD CONSTRAINT "bom_template_items_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── PRIORITY 5: Enterprise audit log ────────────────────────────────────────

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "old_values" JSONB,
  "new_values" JSONB,
  "changed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_changed_by_id_idx" ON "audit_logs"("changed_by_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_changed_by_id_fkey"
  FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

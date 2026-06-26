-- Print Master Configuration (ERP-grade global masters)

CREATE TYPE "MasterConfigStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "SheetType" AS ENUM ('PAPER', 'FLEX', 'VINYL', 'ROLL', 'LARGE_FORMAT', 'CUSTOM');

ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRINT_MASTER_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRINT_MASTER_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRINT_MASTER_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRINT_MASTER_ENABLED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRINT_MASTER_DISABLED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRINT_CONFIG_ASSIGNED';

CREATE TABLE "measurement_units" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "to_mm_factor" DECIMAL(16,8) NOT NULL,
    "status" "MasterConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "measurement_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sheet_sizes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" DECIMAL(10,2) NOT NULL,
    "height" DECIMAL(10,2) NOT NULL,
    "measurement_unit_id" TEXT NOT NULL,
    "aspect_ratio" DECIMAL(10,4),
    "sheet_type" "SheetType" NOT NULL DEFAULT 'PAPER',
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "sheet_sizes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "size_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategy_type" "PrintSizeStrategyType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "size_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "size_template_items" (
    "id" TEXT NOT NULL,
    "size_template_id" TEXT NOT NULL,
    "sheet_size_id" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "width" DECIMAL(10,2),
    "height" DECIMAL(10,2),
    "unit_code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "size_template_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "print_processes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "supported_file_types" JSONB NOT NULL DEFAULT '[]',
    "supported_size_strategies" JSONB NOT NULL DEFAULT '[]',
    "supported_validation_types" JSONB NOT NULL DEFAULT '[]',
    "pricing_strategy_key" TEXT,
    "default_size_template_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "print_processes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "print_specification_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "allowed_formats" JSONB NOT NULL DEFAULT '[]',
    "required_pages" INTEGER,
    "page_names" JSONB NOT NULL DEFAULT '[]',
    "finished_width_mm" DECIMAL(10,2),
    "finished_height_mm" DECIMAL(10,2),
    "artwork_width_mm" DECIMAL(10,2),
    "artwork_height_mm" DECIMAL(10,2),
    "bleed_mm" DECIMAL(10,2),
    "safe_area_mm" DECIMAL(10,2),
    "min_dpi" INTEGER,
    "max_file_size_mb" INTEGER,
    "color_mode" "PrintColorMode" NOT NULL DEFAULT 'ANY',
    "preview_enabled" BOOLEAN NOT NULL DEFAULT true,
    "validation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_artwork_analysis" BOOLEAN NOT NULL DEFAULT true,
    "coverage_analysis_enabled" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "print_specification_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "master_artwork_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "fail_level" "ValidationLevel" NOT NULL DEFAULT 'ERROR',
    "message" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "master_artwork_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "master_validation_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "fail_level" "ValidationLevel" NOT NULL DEFAULT 'ERROR',
    "warning_threshold" DECIMAL(10,4),
    "error_threshold" DECIMAL(10,4),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "master_validation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "master_coverage_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coverage_type" TEXT NOT NULL,
    "price_per_cm2" DECIMAL(12,4) NOT NULL,
    "min_charge" DECIMAL(12,2),
    "max_charge" DECIMAL(12,2),
    "supported_file_types" JSONB NOT NULL DEFAULT '[]',
    "validation_rules" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "master_coverage_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "file_upload_rule_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requirement_type" "FileRequirementType" NOT NULL,
    "max_file_size_mb" INTEGER,
    "allow_multiple" BOOLEAN NOT NULL DEFAULT false,
    "allowed_file_types" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "MasterConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "file_upload_rule_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_print_configs" (
    "id" TEXT NOT NULL,
    "product_offering_version_id" TEXT NOT NULL,
    "print_process_id" TEXT,
    "size_template_id" TEXT,
    "print_specification_template_id" TEXT,
    "file_upload_rule_template_id" TEXT,
    "artwork_rule_ids" JSONB NOT NULL DEFAULT '[]',
    "validation_rule_ids" JSONB NOT NULL DEFAULT '[]',
    "coverage_rule_ids" JSONB NOT NULL DEFAULT '[]',
    "pricing_strategy_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_print_configs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "product_offering_versions" ADD COLUMN IF NOT EXISTS "print_process_id" TEXT;
ALTER TABLE "product_offering_versions" ADD COLUMN IF NOT EXISTS "size_template_id" TEXT;
ALTER TABLE "product_offering_versions" ADD COLUMN IF NOT EXISTS "print_specification_template_id" TEXT;

CREATE UNIQUE INDEX "measurement_units_code_key" ON "measurement_units"("code");
CREATE INDEX "measurement_units_status_deleted_at_idx" ON "measurement_units"("status", "deleted_at");

CREATE UNIQUE INDEX "sheet_sizes_code_key" ON "sheet_sizes"("code");
CREATE INDEX "sheet_sizes_status_deleted_at_idx" ON "sheet_sizes"("status", "deleted_at");
CREATE INDEX "sheet_sizes_sheet_type_idx" ON "sheet_sizes"("sheet_type");
CREATE INDEX "sheet_sizes_sort_order_idx" ON "sheet_sizes"("sort_order");

CREATE UNIQUE INDEX "size_templates_code_key" ON "size_templates"("code");
CREATE INDEX "size_templates_strategy_type_idx" ON "size_templates"("strategy_type");
CREATE INDEX "size_templates_status_deleted_at_idx" ON "size_templates"("status", "deleted_at");

CREATE UNIQUE INDEX "size_template_items_size_template_id_code_key" ON "size_template_items"("size_template_id", "code");
CREATE INDEX "size_template_items_size_template_id_idx" ON "size_template_items"("size_template_id");

CREATE UNIQUE INDEX "print_processes_code_key" ON "print_processes"("code");
CREATE INDEX "print_processes_status_deleted_at_idx" ON "print_processes"("status", "deleted_at");

CREATE UNIQUE INDEX "print_specification_templates_code_key" ON "print_specification_templates"("code");
CREATE INDEX "print_specification_templates_status_deleted_at_idx" ON "print_specification_templates"("status", "deleted_at");

CREATE UNIQUE INDEX "master_artwork_rules_code_key" ON "master_artwork_rules"("code");
CREATE INDEX "master_artwork_rules_status_deleted_at_idx" ON "master_artwork_rules"("status", "deleted_at");

CREATE UNIQUE INDEX "master_validation_rules_code_key" ON "master_validation_rules"("code");
CREATE INDEX "master_validation_rules_status_deleted_at_idx" ON "master_validation_rules"("status", "deleted_at");

CREATE UNIQUE INDEX "master_coverage_rules_code_key" ON "master_coverage_rules"("code");
CREATE INDEX "master_coverage_rules_status_deleted_at_idx" ON "master_coverage_rules"("status", "deleted_at");

CREATE UNIQUE INDEX "file_upload_rule_templates_code_key" ON "file_upload_rule_templates"("code");
CREATE INDEX "file_upload_rule_templates_status_deleted_at_idx" ON "file_upload_rule_templates"("status", "deleted_at");

CREATE UNIQUE INDEX "product_print_configs_product_offering_version_id_key" ON "product_print_configs"("product_offering_version_id");
CREATE INDEX "product_print_configs_print_process_id_idx" ON "product_print_configs"("print_process_id");
CREATE INDEX "product_print_configs_size_template_id_idx" ON "product_print_configs"("size_template_id");

ALTER TABLE "sheet_sizes" ADD CONSTRAINT "sheet_sizes_measurement_unit_id_fkey" FOREIGN KEY ("measurement_unit_id") REFERENCES "measurement_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sheet_sizes" ADD CONSTRAINT "sheet_sizes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "size_templates" ADD CONSTRAINT "size_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "size_template_items" ADD CONSTRAINT "size_template_items_size_template_id_fkey" FOREIGN KEY ("size_template_id") REFERENCES "size_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "size_template_items" ADD CONSTRAINT "size_template_items_sheet_size_id_fkey" FOREIGN KEY ("sheet_size_id") REFERENCES "sheet_sizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "print_processes" ADD CONSTRAINT "print_processes_default_size_template_id_fkey" FOREIGN KEY ("default_size_template_id") REFERENCES "size_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "print_processes" ADD CONSTRAINT "print_processes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "print_specification_templates" ADD CONSTRAINT "print_specification_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "master_artwork_rules" ADD CONSTRAINT "master_artwork_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "master_validation_rules" ADD CONSTRAINT "master_validation_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "master_coverage_rules" ADD CONSTRAINT "master_coverage_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "file_upload_rule_templates" ADD CONSTRAINT "file_upload_rule_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_print_configs" ADD CONSTRAINT "product_print_configs_product_offering_version_id_fkey" FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_print_configs" ADD CONSTRAINT "product_print_configs_print_process_id_fkey" FOREIGN KEY ("print_process_id") REFERENCES "print_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_print_configs" ADD CONSTRAINT "product_print_configs_size_template_id_fkey" FOREIGN KEY ("size_template_id") REFERENCES "size_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_print_configs" ADD CONSTRAINT "product_print_configs_print_specification_template_id_fkey" FOREIGN KEY ("print_specification_template_id") REFERENCES "print_specification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_print_configs" ADD CONSTRAINT "product_print_configs_file_upload_rule_template_id_fkey" FOREIGN KEY ("file_upload_rule_template_id") REFERENCES "file_upload_rule_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_offering_versions" ADD CONSTRAINT "product_offering_versions_print_process_id_fkey" FOREIGN KEY ("print_process_id") REFERENCES "print_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_offering_versions" ADD CONSTRAINT "product_offering_versions_size_template_id_fkey" FOREIGN KEY ("size_template_id") REFERENCES "size_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_offering_versions" ADD CONSTRAINT "product_offering_versions_print_specification_template_id_fkey" FOREIGN KEY ("print_specification_template_id") REFERENCES "print_specification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

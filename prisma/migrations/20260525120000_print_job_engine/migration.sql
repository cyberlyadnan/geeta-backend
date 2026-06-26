-- Print Job Configuration Engine

-- CreateEnum
CREATE TYPE "PrintSizeStrategyType" AS ENUM ('FIXED_SIZE', 'SHEET_BASED', 'AREA_BASED', 'CUSTOM_SIZE', 'ROLL_BASED', 'COVERAGE_BASED');
CREATE TYPE "SizeUnit" AS ENUM ('MM', 'CM', 'INCH', 'FT');
CREATE TYPE "ValidationLevel" AS ENUM ('SUCCESS', 'WARNING', 'ERROR');
CREATE TYPE "ArtworkProcessingStatus" AS ENUM ('PENDING', 'SCANNING', 'VALIDATING', 'ANALYZING', 'GENERATING_PREVIEW', 'COMPLETED', 'FAILED');
CREATE TYPE "ArtworkApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED');
CREATE TYPE "PrintColorMode" AS ENUM ('CMYK', 'RGB', 'GRAYSCALE', 'SPOT', 'ANY');
CREATE TYPE "PrintLayerRole" AS ENUM ('MAIN', 'UV', 'FOIL', 'WHITE_INK', 'SPOT_UV', 'RAISED_UV', 'SCREEN', 'DIE_LINE', 'CUSTOM');

-- AlterEnum
ALTER TYPE "SupportedFileType" ADD VALUE IF NOT EXISTS 'WEBP';
ALTER TYPE "SupportedFileType" ADD VALUE IF NOT EXISTS 'TIFF';

-- CreateTable
CREATE TABLE "print_specifications" (
    "id" TEXT NOT NULL,
    "product_offering_version_id" TEXT NOT NULL,
    "required_pages" INTEGER,
    "page_names" JSONB NOT NULL DEFAULT '[]',
    "artwork_width_mm" DECIMAL(10,2),
    "artwork_height_mm" DECIMAL(10,2),
    "finished_width_mm" DECIMAL(10,2),
    "finished_height_mm" DECIMAL(10,2),
    "bleed_mm" DECIMAL(10,2),
    "safe_area_mm" DECIMAL(10,2),
    "min_dpi" INTEGER,
    "max_file_size_mb" INTEGER,
    "preview_enabled" BOOLEAN NOT NULL DEFAULT true,
    "color_mode" "PrintColorMode" NOT NULL DEFAULT 'ANY',
    "printing_process" TEXT,
    "validation_rules" JSONB NOT NULL DEFAULT '[]',
    "coverage_types" JSONB NOT NULL DEFAULT '[]',
    "allowed_formats" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "print_specifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "print_size_strategies" (
    "id" TEXT NOT NULL,
    "product_offering_version_id" TEXT NOT NULL,
    "strategy_type" "PrintSizeStrategyType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "print_size_strategies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "size_configurations" (
    "id" TEXT NOT NULL,
    "print_size_strategy_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "width" DECIMAL(10,2),
    "height" DECIMAL(10,2),
    "unit" "SizeUnit" NOT NULL DEFAULT 'MM',
    "sheet_code" TEXT,
    "area_cm2" DECIMAL(12,4),
    "pricing_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "size_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coverage_pricing_rules" (
    "id" TEXT NOT NULL,
    "product_offering_version_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "coverage_type" TEXT NOT NULL,
    "price_per_cm2" DECIMAL(12,4) NOT NULL,
    "min_charge" DECIMAL(12,2),
    "max_charge" DECIMAL(12,2),
    "supported_file_types" JSONB NOT NULL DEFAULT '[]',
    "validation_rules" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coverage_pricing_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "print_layers" (
    "id" TEXT NOT NULL,
    "product_offering_version_id" TEXT NOT NULL,
    "file_requirement_id" TEXT,
    "coverage_pricing_rule_id" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "role" "PrintLayerRole" NOT NULL DEFAULT 'MAIN',
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "print_layers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "artwork_rules" (
    "id" TEXT NOT NULL,
    "product_offering_version_id" TEXT NOT NULL,
    "file_requirement_id" TEXT,
    "print_layer_id" TEXT,
    "rule_code" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "fail_level" "ValidationLevel" NOT NULL DEFAULT 'ERROR',
    "message" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "artwork_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "artwork_files" (
    "id" TEXT NOT NULL,
    "file_asset_id" TEXT NOT NULL,
    "file_requirement_id" TEXT,
    "print_layer_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "version_id" TEXT,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "processing_status" "ArtworkProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "artwork_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "artwork_versions" (
    "id" TEXT NOT NULL,
    "artwork_file_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_asset_id" TEXT NOT NULL,
    "preview_key" TEXT,
    "preview_url" TEXT,
    "processing_status" "ArtworkProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "virus_scan_passed" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "artwork_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "artwork_metadata" (
    "id" TEXT NOT NULL,
    "artwork_version_id" TEXT NOT NULL,
    "file_format" TEXT NOT NULL,
    "width_px" INTEGER,
    "height_px" INTEGER,
    "width_mm" DECIMAL(10,2),
    "height_mm" DECIMAL(10,2),
    "dpi" INTEGER,
    "page_count" INTEGER,
    "color_mode" "PrintColorMode",
    "has_transparency" BOOLEAN NOT NULL DEFAULT false,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "file_size_bytes" INTEGER NOT NULL,
    "raw_metadata" JSONB NOT NULL DEFAULT '{}',
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "artwork_metadata_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "artwork_validations" (
    "id" TEXT NOT NULL,
    "artwork_version_id" TEXT NOT NULL,
    "overall_level" "ValidationLevel" NOT NULL,
    "can_proceed" BOOLEAN NOT NULL,
    "checks" JSONB NOT NULL DEFAULT '[]',
    "validated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "artwork_validations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coverage_analyses" (
    "id" TEXT NOT NULL,
    "artwork_version_id" TEXT NOT NULL,
    "coverage_type" TEXT NOT NULL,
    "coverage_percent" DECIMAL(8,4) NOT NULL,
    "coverage_mm2" DECIMAL(14,4) NOT NULL,
    "coverage_cm2" DECIMAL(12,4) NOT NULL,
    "bounding_box" JSONB NOT NULL DEFAULT '{}',
    "printable_pixels" INTEGER,
    "analysis_data" JSONB NOT NULL DEFAULT '{}',
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coverage_analyses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_artworks" (
    "id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "artwork_file_id" TEXT NOT NULL,
    "file_requirement_code" TEXT NOT NULL,
    "print_layer_code" TEXT,
    "approval_status" "ArtworkApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "admin_notes" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "order_artworks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_artwork_versions" (
    "id" TEXT NOT NULL,
    "order_artwork_id" TEXT NOT NULL,
    "artwork_version_id" TEXT NOT NULL,
    "pinned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_artwork_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "print_specifications_product_offering_version_id_key" ON "print_specifications"("product_offering_version_id");
CREATE UNIQUE INDEX "print_size_strategies_product_offering_version_id_key" ON "print_size_strategies"("product_offering_version_id");
CREATE UNIQUE INDEX "size_configurations_print_size_strategy_id_code_key" ON "size_configurations"("print_size_strategy_id", "code");
CREATE INDEX "size_configurations_print_size_strategy_id_idx" ON "size_configurations"("print_size_strategy_id");
CREATE UNIQUE INDEX "coverage_pricing_rules_product_offering_version_id_code_key" ON "coverage_pricing_rules"("product_offering_version_id", "code");
CREATE INDEX "coverage_pricing_rules_product_offering_version_id_idx" ON "coverage_pricing_rules"("product_offering_version_id");
CREATE UNIQUE INDEX "print_layers_file_requirement_id_key" ON "print_layers"("file_requirement_id");
CREATE UNIQUE INDEX "print_layers_product_offering_version_id_code_key" ON "print_layers"("product_offering_version_id", "code");
CREATE INDEX "print_layers_product_offering_version_id_idx" ON "print_layers"("product_offering_version_id");
CREATE UNIQUE INDEX "artwork_rules_product_offering_version_id_rule_code_key" ON "artwork_rules"("product_offering_version_id", "rule_code");
CREATE INDEX "artwork_rules_product_offering_version_id_idx" ON "artwork_rules"("product_offering_version_id");
CREATE INDEX "artwork_rules_file_requirement_id_idx" ON "artwork_rules"("file_requirement_id");
CREATE UNIQUE INDEX "artwork_files_file_asset_id_key" ON "artwork_files"("file_asset_id");
CREATE INDEX "artwork_files_owner_id_idx" ON "artwork_files"("owner_id");
CREATE INDEX "artwork_files_file_requirement_id_idx" ON "artwork_files"("file_requirement_id");
CREATE INDEX "artwork_files_version_id_idx" ON "artwork_files"("version_id");
CREATE UNIQUE INDEX "artwork_versions_artwork_file_id_version_number_key" ON "artwork_versions"("artwork_file_id", "version_number");
CREATE INDEX "artwork_versions_artwork_file_id_idx" ON "artwork_versions"("artwork_file_id");
CREATE INDEX "artwork_versions_file_asset_id_idx" ON "artwork_versions"("file_asset_id");
CREATE UNIQUE INDEX "artwork_metadata_artwork_version_id_key" ON "artwork_metadata"("artwork_version_id");
CREATE UNIQUE INDEX "artwork_validations_artwork_version_id_key" ON "artwork_validations"("artwork_version_id");
CREATE INDEX "coverage_analyses_artwork_version_id_idx" ON "coverage_analyses"("artwork_version_id");
CREATE INDEX "coverage_analyses_coverage_type_idx" ON "coverage_analyses"("coverage_type");
CREATE INDEX "order_artworks_order_item_id_idx" ON "order_artworks"("order_item_id");
CREATE INDEX "order_artworks_artwork_file_id_idx" ON "order_artworks"("artwork_file_id");
CREATE INDEX "order_artworks_approval_status_idx" ON "order_artworks"("approval_status");
CREATE UNIQUE INDEX "order_artwork_versions_order_artwork_id_key" ON "order_artwork_versions"("order_artwork_id");
CREATE INDEX "order_artwork_versions_artwork_version_id_idx" ON "order_artwork_versions"("artwork_version_id");
CREATE INDEX "print_size_strategies_strategy_type_idx" ON "print_size_strategies"("strategy_type");

-- AddForeignKey
ALTER TABLE "print_specifications" ADD CONSTRAINT "print_specifications_product_offering_version_id_fkey" FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "print_size_strategies" ADD CONSTRAINT "print_size_strategies_product_offering_version_id_fkey" FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "size_configurations" ADD CONSTRAINT "size_configurations_print_size_strategy_id_fkey" FOREIGN KEY ("print_size_strategy_id") REFERENCES "print_size_strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coverage_pricing_rules" ADD CONSTRAINT "coverage_pricing_rules_product_offering_version_id_fkey" FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "print_layers" ADD CONSTRAINT "print_layers_product_offering_version_id_fkey" FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "print_layers" ADD CONSTRAINT "print_layers_file_requirement_id_fkey" FOREIGN KEY ("file_requirement_id") REFERENCES "file_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "print_layers" ADD CONSTRAINT "print_layers_coverage_pricing_rule_id_fkey" FOREIGN KEY ("coverage_pricing_rule_id") REFERENCES "coverage_pricing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "artwork_rules" ADD CONSTRAINT "artwork_rules_product_offering_version_id_fkey" FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artwork_rules" ADD CONSTRAINT "artwork_rules_file_requirement_id_fkey" FOREIGN KEY ("file_requirement_id") REFERENCES "file_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "artwork_rules" ADD CONSTRAINT "artwork_rules_print_layer_id_fkey" FOREIGN KEY ("print_layer_id") REFERENCES "print_layers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "artwork_files" ADD CONSTRAINT "artwork_files_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artwork_files" ADD CONSTRAINT "artwork_files_file_requirement_id_fkey" FOREIGN KEY ("file_requirement_id") REFERENCES "file_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "artwork_files" ADD CONSTRAINT "artwork_files_print_layer_id_fkey" FOREIGN KEY ("print_layer_id") REFERENCES "print_layers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "artwork_files" ADD CONSTRAINT "artwork_files_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artwork_files" ADD CONSTRAINT "artwork_files_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "product_offering_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "artwork_versions" ADD CONSTRAINT "artwork_versions_artwork_file_id_fkey" FOREIGN KEY ("artwork_file_id") REFERENCES "artwork_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artwork_versions" ADD CONSTRAINT "artwork_versions_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artwork_metadata" ADD CONSTRAINT "artwork_metadata_artwork_version_id_fkey" FOREIGN KEY ("artwork_version_id") REFERENCES "artwork_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artwork_validations" ADD CONSTRAINT "artwork_validations_artwork_version_id_fkey" FOREIGN KEY ("artwork_version_id") REFERENCES "artwork_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coverage_analyses" ADD CONSTRAINT "coverage_analyses_artwork_version_id_fkey" FOREIGN KEY ("artwork_version_id") REFERENCES "artwork_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_artworks" ADD CONSTRAINT "order_artworks_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "production_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_artworks" ADD CONSTRAINT "order_artworks_artwork_file_id_fkey" FOREIGN KEY ("artwork_file_id") REFERENCES "artwork_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_artworks" ADD CONSTRAINT "order_artworks_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_artwork_versions" ADD CONSTRAINT "order_artwork_versions_order_artwork_id_fkey" FOREIGN KEY ("order_artwork_id") REFERENCES "order_artworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_artwork_versions" ADD CONSTRAINT "order_artwork_versions_artwork_version_id_fkey" FOREIGN KEY ("artwork_version_id") REFERENCES "artwork_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

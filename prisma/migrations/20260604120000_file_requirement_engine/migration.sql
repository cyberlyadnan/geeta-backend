-- Product Engine Phase 4 — File Requirement Engine (Cloudflare R2 compatible)

CREATE TYPE "FileRequirementType" AS ENUM ('REQUIRED', 'OPTIONAL');

CREATE TYPE "SupportedFileType" AS ENUM (
  'PDF',
  'AI',
  'PSD',
  'CDR',
  'EPS',
  'SVG',
  'PNG',
  'JPG',
  'JPEG',
  'ZIP',
  'OTHER'
);

CREATE TABLE "file_requirements" (
    "id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "requirement_type" "FileRequirementType" NOT NULL,
    "max_file_size_mb" INTEGER,
    "allow_multiple" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "file_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "file_requirement_file_types" (
    "id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "file_type" "SupportedFileType" NOT NULL,
    CONSTRAINT "file_requirement_file_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "file_assets" (
    "id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "file_requirements_offering_id_code_key"
    ON "file_requirements"("offering_id", "code");
CREATE INDEX "file_requirements_offering_id_idx"
    ON "file_requirements"("offering_id");

CREATE UNIQUE INDEX "file_requirement_file_types_requirement_id_file_type_key"
    ON "file_requirement_file_types"("requirement_id", "file_type");
CREATE INDEX "file_requirement_file_types_requirement_id_idx"
    ON "file_requirement_file_types"("requirement_id");

CREATE UNIQUE INDEX "file_assets_file_key_key"
    ON "file_assets"("file_key");
CREATE INDEX "file_assets_uploaded_by_id_idx"
    ON "file_assets"("uploaded_by_id");
CREATE INDEX "file_assets_created_at_idx"
    ON "file_assets"("created_at");

ALTER TABLE "file_requirements"
    ADD CONSTRAINT "file_requirements_offering_id_fkey"
    FOREIGN KEY ("offering_id") REFERENCES "product_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "file_requirement_file_types"
    ADD CONSTRAINT "file_requirement_file_types_requirement_id_fkey"
    FOREIGN KEY ("requirement_id") REFERENCES "file_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "file_assets"
    ADD CONSTRAINT "file_assets_uploaded_by_id_fkey"
    FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

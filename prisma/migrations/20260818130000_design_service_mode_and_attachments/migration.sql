-- Tri-state replacement for product_type_profiles.requires_design_approval: NOT_OFFERED /
-- OPTIONAL / REQUIRED, so "mandatory but not offered" can't be represented. Additive only —
-- the old boolean column stays in place and readable until every call site has moved onto the
-- new column, dropped in a follow-up migration.
CREATE TYPE "DesignServiceMode" AS ENUM ('NOT_OFFERED', 'OPTIONAL', 'REQUIRED');

ALTER TABLE "product_type_profiles"
  ADD COLUMN "design_service_mode" "DesignServiceMode" NOT NULL DEFAULT 'NOT_OFFERED';

UPDATE "product_type_profiles"
  SET "design_service_mode" = 'REQUIRED'
  WHERE "requires_design_approval" = true;

-- Reference material (photos, logos, existing artwork to redo) a vendor uploads when asking for
-- design help. Deliberately separate from artwork_files, which is print-ready output, not input.
CREATE TABLE "design_task_attachments" (
    "id" TEXT NOT NULL,
    "design_task_id" TEXT NOT NULL,
    "file_asset_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_task_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "design_task_attachments_file_asset_id_key" ON "design_task_attachments"("file_asset_id");

CREATE INDEX "design_task_attachments_design_task_id_idx" ON "design_task_attachments"("design_task_id");

ALTER TABLE "design_task_attachments"
  ADD CONSTRAINT "design_task_attachments_design_task_id_fkey"
  FOREIGN KEY ("design_task_id") REFERENCES "design_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "design_task_attachments"
  ADD CONSTRAINT "design_task_attachments_file_asset_id_fkey"
  FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

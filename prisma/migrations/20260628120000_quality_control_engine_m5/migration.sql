-- Milestone 5: Quality Control Engine

ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'QC_STARTED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'QC_PASSED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'QC_FAILED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'QC_HOLD';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'REWORK_REQUESTED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'QC_NOTE_ADDED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'QC_ATTACHMENT_ADDED';

CREATE TYPE "QualityInspectionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "QualityInspectionResult" AS ENUM ('PASS', 'FAIL', 'PASS_WITH_REMARKS', 'ON_HOLD', 'REWORK_REQUIRED');
CREATE TYPE "QualityDefectSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "QcAttachmentCategory" AS ENUM ('PHOTO', 'PDF', 'REPORT', 'ANNOTATED_ARTWORK');

ALTER TABLE "rework_requests" ADD COLUMN IF NOT EXISTS "target_task_id" TEXT;
ALTER TABLE "rework_requests" ADD COLUMN IF NOT EXISTS "qc_inspection_id" TEXT;
ALTER TABLE "rework_requests" ADD COLUMN IF NOT EXISTS "rework_cycle" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "quality_checklist_templates" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "workflow_template_step_id" TEXT,
  "product_offering_version_id" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quality_checklist_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_checklist_template_items" (
  "id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "item_code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quality_checklist_template_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_inspections" (
  "id" TEXT NOT NULL,
  "workflow_task_id" TEXT NOT NULL,
  "workflow_instance_id" TEXT NOT NULL,
  "inspector_id" TEXT NOT NULL,
  "checklist_template_id" TEXT,
  "status" "QualityInspectionStatus" NOT NULL DEFAULT 'DRAFT',
  "result" "QualityInspectionResult",
  "remarks" TEXT,
  "rework_cycle" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quality_inspections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_inspection_items" (
  "id" TEXT NOT NULL,
  "inspection_id" TEXT NOT NULL,
  "template_item_id" TEXT,
  "item_code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "passed" BOOLEAN,
  "remarks" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quality_inspection_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_inspection_defects" (
  "id" TEXT NOT NULL,
  "inspection_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" "QualityDefectSeverity" NOT NULL DEFAULT 'MEDIUM',
  "description" TEXT NOT NULL,
  "remarks" TEXT,
  "file_asset_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quality_inspection_defects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_inspection_attachments" (
  "id" TEXT NOT NULL,
  "inspection_id" TEXT NOT NULL,
  "file_asset_id" TEXT NOT NULL,
  "category" "QcAttachmentCategory" NOT NULL,
  "label" TEXT,
  "uploaded_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quality_inspection_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quality_checklist_templates_code_key" ON "quality_checklist_templates"("code");
CREATE UNIQUE INDEX "quality_checklist_template_items_template_id_item_code_key" ON "quality_checklist_template_items"("template_id", "item_code");

CREATE INDEX "quality_checklist_templates_workflow_template_step_id_idx" ON "quality_checklist_templates"("workflow_template_step_id");
CREATE INDEX "quality_checklist_templates_product_offering_version_id_is_active_idx" ON "quality_checklist_templates"("product_offering_version_id", "is_active");
CREATE INDEX "quality_checklist_template_items_template_id_sort_order_idx" ON "quality_checklist_template_items"("template_id", "sort_order");

CREATE INDEX "quality_inspections_workflow_task_id_status_idx" ON "quality_inspections"("workflow_task_id", "status");
CREATE INDEX "quality_inspections_workflow_instance_id_idx" ON "quality_inspections"("workflow_instance_id");
CREATE INDEX "quality_inspections_inspector_id_status_idx" ON "quality_inspections"("inspector_id", "status");
CREATE INDEX "quality_inspections_result_idx" ON "quality_inspections"("result");
CREATE INDEX "quality_inspections_completed_at_idx" ON "quality_inspections"("completed_at" DESC);

CREATE INDEX "quality_inspection_items_inspection_id_idx" ON "quality_inspection_items"("inspection_id");
CREATE INDEX "quality_inspection_defects_inspection_id_idx" ON "quality_inspection_defects"("inspection_id");
CREATE INDEX "quality_inspection_attachments_inspection_id_created_at_idx" ON "quality_inspection_attachments"("inspection_id", "created_at" DESC);

CREATE INDEX "rework_requests_target_task_id_idx" ON "rework_requests"("target_task_id");
CREATE INDEX "rework_requests_qc_inspection_id_idx" ON "rework_requests"("qc_inspection_id");

ALTER TABLE "quality_checklist_templates" ADD CONSTRAINT "quality_checklist_templates_workflow_template_step_id_fkey" FOREIGN KEY ("workflow_template_step_id") REFERENCES "workflow_template_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quality_checklist_templates" ADD CONSTRAINT "quality_checklist_templates_product_offering_version_id_fkey" FOREIGN KEY ("product_offering_version_id") REFERENCES "product_offering_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quality_checklist_template_items" ADD CONSTRAINT "quality_checklist_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "quality_checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_workflow_task_id_fkey" FOREIGN KEY ("workflow_task_id") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_workflow_instance_id_fkey" FOREIGN KEY ("workflow_instance_id") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_checklist_template_id_fkey" FOREIGN KEY ("checklist_template_id") REFERENCES "quality_checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quality_inspection_items" ADD CONSTRAINT "quality_inspection_items_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "quality_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quality_inspection_defects" ADD CONSTRAINT "quality_inspection_defects_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "quality_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_inspection_defects" ADD CONSTRAINT "quality_inspection_defects_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quality_inspection_attachments" ADD CONSTRAINT "quality_inspection_attachments_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "quality_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_inspection_attachments" ADD CONSTRAINT "quality_inspection_attachments_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quality_inspection_attachments" ADD CONSTRAINT "quality_inspection_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rework_requests" ADD CONSTRAINT "rework_requests_target_task_id_fkey" FOREIGN KEY ("target_task_id") REFERENCES "workflow_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rework_requests" ADD CONSTRAINT "rework_requests_qc_inspection_id_fkey" FOREIGN KEY ("qc_inspection_id") REFERENCES "quality_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "quality_inspections_one_active_per_task_idx"
  ON "quality_inspections"("workflow_task_id")
  WHERE "status" IN ('DRAFT', 'IN_PROGRESS');

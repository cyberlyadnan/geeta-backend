-- Product Engine Phase 5 — Workflow Engine (production workflow templates, facilities, SLA)

CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

CREATE TYPE "WorkflowTaskStatus" AS ENUM (
  'PENDING',
  'READY',
  'ASSIGNED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'SKIPPED'
);

CREATE TYPE "WorkflowStepType" AS ENUM (
  'VERIFICATION',
  'PRINTING',
  'LAMINATION',
  'UV',
  'FOILING',
  'DIE_CUTTING',
  'PACKAGING',
  'DISPATCH',
  'QUALITY_CHECK',
  'CUSTOM'
);

CREATE TYPE "WorkflowPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_templates" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_template_steps" (
    "id" TEXT NOT NULL,
    "workflow_template_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "step_name" TEXT NOT NULL,
    "step_code" TEXT NOT NULL,
    "step_type" "WorkflowStepType" NOT NULL,
    "step_order" INTEGER NOT NULL,
    "expected_minutes" INTEGER NOT NULL,
    "allow_rework" BOOLEAN NOT NULL DEFAULT true,
    "allow_skip" BOOLEAN NOT NULL DEFAULT false,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_template_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_offering_workflows" (
    "id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "workflow_template_id" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_offering_workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_sla_policies" (
    "id" TEXT NOT NULL,
    "workflow_template_step_id" TEXT NOT NULL,
    "warning_after_minutes" INTEGER NOT NULL,
    "critical_after_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflow_sla_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facilities_code_key" ON "facilities"("code");

CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");
CREATE INDEX "departments_facility_id_idx" ON "departments"("facility_id");

CREATE UNIQUE INDEX "workflow_templates_code_key" ON "workflow_templates"("code");
CREATE INDEX "workflow_templates_facility_id_idx" ON "workflow_templates"("facility_id");

CREATE UNIQUE INDEX "workflow_template_steps_workflow_template_id_step_order_key"
    ON "workflow_template_steps"("workflow_template_id", "step_order");
CREATE INDEX "workflow_template_steps_workflow_template_id_idx"
    ON "workflow_template_steps"("workflow_template_id");
CREATE INDEX "workflow_template_steps_department_id_idx"
    ON "workflow_template_steps"("department_id");

CREATE UNIQUE INDEX "product_offering_workflows_offering_id_key"
    ON "product_offering_workflows"("offering_id");
CREATE INDEX "product_offering_workflows_workflow_template_id_idx"
    ON "product_offering_workflows"("workflow_template_id");

CREATE UNIQUE INDEX "workflow_sla_policies_workflow_template_step_id_key"
    ON "workflow_sla_policies"("workflow_template_step_id");

ALTER TABLE "departments"
    ADD CONSTRAINT "departments_facility_id_fkey"
    FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_templates"
    ADD CONSTRAINT "workflow_templates_facility_id_fkey"
    FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_template_steps"
    ADD CONSTRAINT "workflow_template_steps_workflow_template_id_fkey"
    FOREIGN KEY ("workflow_template_id") REFERENCES "workflow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_template_steps"
    ADD CONSTRAINT "workflow_template_steps_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_offering_workflows"
    ADD CONSTRAINT "product_offering_workflows_offering_id_fkey"
    FOREIGN KEY ("offering_id") REFERENCES "product_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_offering_workflows"
    ADD CONSTRAINT "product_offering_workflows_workflow_template_id_fkey"
    FOREIGN KEY ("workflow_template_id") REFERENCES "workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_sla_policies"
    ADD CONSTRAINT "workflow_sla_policies_workflow_template_step_id_fkey"
    FOREIGN KEY ("workflow_template_step_id") REFERENCES "workflow_template_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

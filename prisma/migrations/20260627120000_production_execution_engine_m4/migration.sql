-- Milestone 4: Production Execution Engine

-- ActivityAction extensions
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_STARTED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_PAUSED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_RESUMED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_HELD';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_COMPLETED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_NOTE_ADDED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_ATTACHMENT_ADDED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SUPERVISOR_REQUESTED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_ISSUE_REPORTED';

-- New enums
CREATE TYPE "ProductionHoldReason" AS ENUM (
  'ARTWORK_ISSUE',
  'MACHINE_ISSUE',
  'PAPER_ISSUE',
  'POWER_FAILURE',
  'CUSTOMER_CLARIFICATION',
  'WAITING_MATERIAL',
  'SUPERVISOR_REVIEW',
  'OTHER'
);

CREATE TYPE "ProductionAttachmentCategory" AS ENUM (
  'IMAGE',
  'PDF',
  'PRODUCTION_PROOF',
  'QC_IMAGE'
);

CREATE TYPE "ProductionExecutionAlertType" AS ENUM (
  'SUPERVISOR_REQUEST',
  'ISSUE_REPORT'
);

CREATE TYPE "WorkflowTaskExecutionSessionStatus" AS ENUM (
  'IN_PROGRESS',
  'PAUSED',
  'ON_HOLD',
  'COMPLETED'
);

CREATE TYPE "WorkflowTaskExecutionIntervalType" AS ENUM (
  'WORKING',
  'PAUSED',
  'HOLD'
);

CREATE TABLE "workflow_task_execution_sessions" (
  "id" TEXT NOT NULL,
  "workflow_task_id" TEXT NOT NULL,
  "assignment_id" TEXT,
  "operator_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "status" "WorkflowTaskExecutionSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paused_at" TIMESTAMP(3),
  "resumed_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "working_duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "paused_duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "hold_duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "total_duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "active_interval_started_at" TIMESTAMP(3),
  "active_interval_type" "WorkflowTaskExecutionIntervalType",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workflow_task_execution_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_task_execution_intervals" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "interval_type" "WorkflowTaskExecutionIntervalType" NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL,
  "ended_at" TIMESTAMP(3),
  "duration_seconds" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workflow_task_execution_intervals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_task_holds" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "workflow_task_id" TEXT NOT NULL,
  "reason" "ProductionHoldReason" NOT NULL,
  "notes" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMP(3),
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workflow_task_holds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_task_production_notes" (
  "id" TEXT NOT NULL,
  "workflow_task_id" TEXT NOT NULL,
  "session_id" TEXT,
  "operator_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "file_asset_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workflow_task_production_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_task_attachments" (
  "id" TEXT NOT NULL,
  "workflow_task_id" TEXT NOT NULL,
  "session_id" TEXT,
  "file_asset_id" TEXT NOT NULL,
  "category" "ProductionAttachmentCategory" NOT NULL,
  "label" TEXT,
  "uploaded_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workflow_task_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_task_execution_alerts" (
  "id" TEXT NOT NULL,
  "workflow_task_id" TEXT NOT NULL,
  "session_id" TEXT,
  "operator_id" TEXT NOT NULL,
  "alert_type" "ProductionExecutionAlertType" NOT NULL,
  "notes" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workflow_task_execution_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_task_execution_sessions_workflow_task_id_status_idx" ON "workflow_task_execution_sessions"("workflow_task_id", "status");
CREATE INDEX "workflow_task_execution_sessions_operator_id_status_idx" ON "workflow_task_execution_sessions"("operator_id", "status");
CREATE INDEX "workflow_task_execution_sessions_department_id_status_idx" ON "workflow_task_execution_sessions"("department_id", "status");
CREATE INDEX "workflow_task_execution_sessions_started_at_idx" ON "workflow_task_execution_sessions"("started_at" DESC);

CREATE INDEX "workflow_task_execution_intervals_session_id_started_at_idx" ON "workflow_task_execution_intervals"("session_id", "started_at" DESC);

CREATE INDEX "workflow_task_holds_workflow_task_id_started_at_idx" ON "workflow_task_holds"("workflow_task_id", "started_at" DESC);
CREATE INDEX "workflow_task_holds_session_id_idx" ON "workflow_task_holds"("session_id");

CREATE INDEX "workflow_task_production_notes_workflow_task_id_created_at_idx" ON "workflow_task_production_notes"("workflow_task_id", "created_at" DESC);
CREATE INDEX "workflow_task_production_notes_operator_id_idx" ON "workflow_task_production_notes"("operator_id");

CREATE INDEX "workflow_task_attachments_workflow_task_id_created_at_idx" ON "workflow_task_attachments"("workflow_task_id", "created_at" DESC);
CREATE INDEX "workflow_task_attachments_session_id_idx" ON "workflow_task_attachments"("session_id");

CREATE INDEX "workflow_task_execution_alerts_workflow_task_id_created_at_idx" ON "workflow_task_execution_alerts"("workflow_task_id", "created_at" DESC);
CREATE INDEX "workflow_task_execution_alerts_alert_type_idx" ON "workflow_task_execution_alerts"("alert_type");

ALTER TABLE "workflow_task_execution_sessions" ADD CONSTRAINT "workflow_task_execution_sessions_workflow_task_id_fkey" FOREIGN KEY ("workflow_task_id") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_task_execution_sessions" ADD CONSTRAINT "workflow_task_execution_sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "workflow_task_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_task_execution_sessions" ADD CONSTRAINT "workflow_task_execution_sessions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_task_execution_sessions" ADD CONSTRAINT "workflow_task_execution_sessions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_task_execution_intervals" ADD CONSTRAINT "workflow_task_execution_intervals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workflow_task_execution_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_task_holds" ADD CONSTRAINT "workflow_task_holds_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workflow_task_execution_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_task_holds" ADD CONSTRAINT "workflow_task_holds_workflow_task_id_fkey" FOREIGN KEY ("workflow_task_id") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_task_holds" ADD CONSTRAINT "workflow_task_holds_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_task_production_notes" ADD CONSTRAINT "workflow_task_production_notes_workflow_task_id_fkey" FOREIGN KEY ("workflow_task_id") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_task_production_notes" ADD CONSTRAINT "workflow_task_production_notes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workflow_task_execution_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_task_production_notes" ADD CONSTRAINT "workflow_task_production_notes_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_task_production_notes" ADD CONSTRAINT "workflow_task_production_notes_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_task_production_notes" ADD CONSTRAINT "workflow_task_production_notes_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_task_attachments" ADD CONSTRAINT "workflow_task_attachments_workflow_task_id_fkey" FOREIGN KEY ("workflow_task_id") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_task_attachments" ADD CONSTRAINT "workflow_task_attachments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workflow_task_execution_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_task_attachments" ADD CONSTRAINT "workflow_task_attachments_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_task_attachments" ADD CONSTRAINT "workflow_task_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_task_execution_alerts" ADD CONSTRAINT "workflow_task_execution_alerts_workflow_task_id_fkey" FOREIGN KEY ("workflow_task_id") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_task_execution_alerts" ADD CONSTRAINT "workflow_task_execution_alerts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workflow_task_execution_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_task_execution_alerts" ADD CONSTRAINT "workflow_task_execution_alerts_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "workflow_task_execution_sessions_one_active_per_task_idx"
  ON "workflow_task_execution_sessions"("workflow_task_id")
  WHERE "status" IN ('IN_PROGRESS', 'PAUSED', 'ON_HOLD');

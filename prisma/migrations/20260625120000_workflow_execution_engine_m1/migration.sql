-- Milestone 1: Workflow Execution Engine

-- Workflow instance status extensions
ALTER TYPE "WorkflowInstanceStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "WorkflowInstanceStatus" ADD VALUE IF NOT EXISTS 'INITIALIZED';
ALTER TYPE "WorkflowInstanceStatus" ADD VALUE IF NOT EXISTS 'RUNNING';
ALTER TYPE "WorkflowInstanceStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "WorkflowInstanceStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- Task status extensions
ALTER TYPE "WorkflowTaskStatus" ADD VALUE IF NOT EXISTS 'WAITING';
ALTER TYPE "WorkflowTaskStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "WorkflowTaskStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
ALTER TYPE "WorkflowTaskStatus" ADD VALUE IF NOT EXISTS 'REWORK';

-- History action extensions
ALTER TYPE "WorkflowHistoryAction" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "WorkflowHistoryAction" ADD VALUE IF NOT EXISTS 'RESUMED';
ALTER TYPE "WorkflowHistoryAction" ADD VALUE IF NOT EXISTS 'BLOCKED';
ALTER TYPE "WorkflowHistoryAction" ADD VALUE IF NOT EXISTS 'UNBLOCKED';
ALTER TYPE "WorkflowHistoryAction" ADD VALUE IF NOT EXISTS 'ACTIVATED';
ALTER TYPE "WorkflowHistoryAction" ADD VALUE IF NOT EXISTS 'SKIPPED';
ALTER TYPE "WorkflowHistoryAction" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "WorkflowHistoryAction" ADD VALUE IF NOT EXISTS 'STATUS_CHANGED';

CREATE TYPE "WorkflowStepDependencyType" AS ENUM ('FINISH_TO_START', 'START_TO_START');
CREATE TYPE "WorkflowTimelineEntityType" AS ENUM ('WORKFLOW_INSTANCE', 'WORKFLOW_TASK');

-- Workflow instance extensions
ALTER TABLE "workflow_instances"
  ADD COLUMN IF NOT EXISTS "production_order_item_id" TEXT,
  ADD COLUMN IF NOT EXISTS "template_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "created_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_instances_production_order_item_id_key"
  ON "workflow_instances"("production_order_item_id");

CREATE INDEX IF NOT EXISTS "workflow_instances_created_at_idx"
  ON "workflow_instances"("created_at" DESC);

ALTER TABLE "workflow_instances"
  ADD CONSTRAINT "workflow_instances_production_order_item_id_fkey"
  FOREIGN KEY ("production_order_item_id") REFERENCES "production_order_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_instances"
  ADD CONSTRAINT "workflow_instances_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Template step extensions
ALTER TABLE "workflow_template_steps"
  ADD COLUMN IF NOT EXISTS "instructions" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS "workflow_template_step_dependencies" (
  "id" TEXT NOT NULL,
  "workflow_template_step_id" TEXT NOT NULL,
  "depends_on_step_id" TEXT NOT NULL,
  "dependency_type" "WorkflowStepDependencyType" NOT NULL DEFAULT 'FINISH_TO_START',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_template_step_dependencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_template_step_dependencies_workflow_template_step_id_depends_on_step_id_key"
  ON "workflow_template_step_dependencies"("workflow_template_step_id", "depends_on_step_id");
CREATE INDEX IF NOT EXISTS "workflow_template_step_dependencies_depends_on_step_id_idx"
  ON "workflow_template_step_dependencies"("depends_on_step_id");

ALTER TABLE "workflow_template_step_dependencies"
  ADD CONSTRAINT "workflow_template_step_dependencies_workflow_template_step_id_fkey"
  FOREIGN KEY ("workflow_template_step_id") REFERENCES "workflow_template_steps"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_template_step_dependencies"
  ADD CONSTRAINT "workflow_template_step_dependencies_depends_on_step_id_fkey"
  FOREIGN KEY ("depends_on_step_id") REFERENCES "workflow_template_steps"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Task extensions
ALTER TABLE "workflow_tasks"
  ADD COLUMN IF NOT EXISTS "step_order" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "priority" "WorkflowPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "estimated_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "instructions" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_tasks_workflow_instance_id_workflow_template_step_id_key"
  ON "workflow_tasks"("workflow_instance_id", "workflow_template_step_id");

CREATE INDEX IF NOT EXISTS "workflow_tasks_workflow_instance_id_step_order_idx"
  ON "workflow_tasks"("workflow_instance_id", "step_order");

CREATE INDEX IF NOT EXISTS "workflow_tasks_department_id_status_priority_due_at_idx"
  ON "workflow_tasks"("department_id", "status", "priority", "due_at");

CREATE TABLE IF NOT EXISTS "workflow_task_dependencies" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "depends_on_task_id" TEXT NOT NULL,
  "dependency_type" "WorkflowStepDependencyType" NOT NULL DEFAULT 'FINISH_TO_START',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_task_dependencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_task_dependencies_task_id_depends_on_task_id_key"
  ON "workflow_task_dependencies"("task_id", "depends_on_task_id");
CREATE INDEX IF NOT EXISTS "workflow_task_dependencies_depends_on_task_id_idx"
  ON "workflow_task_dependencies"("depends_on_task_id");

ALTER TABLE "workflow_task_dependencies"
  ADD CONSTRAINT "workflow_task_dependencies_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "workflow_tasks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_task_dependencies"
  ADD CONSTRAINT "workflow_task_dependencies_depends_on_task_id_fkey"
  FOREIGN KEY ("depends_on_task_id") REFERENCES "workflow_tasks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "workflow_timeline_events" (
  "id" TEXT NOT NULL,
  "workflow_instance_id" TEXT NOT NULL,
  "entity_type" "WorkflowTimelineEntityType" NOT NULL,
  "entity_id" TEXT,
  "event_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "actor_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflow_timeline_events_workflow_instance_id_created_at_idx"
  ON "workflow_timeline_events"("workflow_instance_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "workflow_timeline_events_entity_type_entity_id_idx"
  ON "workflow_timeline_events"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "workflow_timeline_events_event_type_idx"
  ON "workflow_timeline_events"("event_type");

ALTER TABLE "workflow_timeline_events"
  ADD CONSTRAINT "workflow_timeline_events_workflow_instance_id_fkey"
  FOREIGN KEY ("workflow_instance_id") REFERENCES "workflow_instances"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_timeline_events"
  ADD CONSTRAINT "workflow_timeline_events_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Milestone 3: Task Assignment Engine

CREATE TYPE "WorkflowTaskAssignmentStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'UNASSIGNED');
CREATE TYPE "WorkflowTaskAssignmentHistoryAction" AS ENUM (
  'ASSIGNED',
  'REASSIGNED',
  'UNASSIGNED',
  'PRIORITY_CHANGED',
  'DUE_DATE_CHANGED',
  'OPERATOR_CHANGED',
  'REMARKS_CHANGED',
  'MACHINE_CHANGED'
);
CREATE TYPE "DepartmentStaffRole" AS ENUM ('OPERATOR', 'SUPERVISOR');

ALTER TYPE "WorkflowHistoryAction" ADD VALUE IF NOT EXISTS 'UNASSIGNED';
ALTER TYPE "WorkflowHistoryAction" ADD VALUE IF NOT EXISTS 'REASSIGNED';

ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_REASSIGNED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_UNASSIGNED';

CREATE TABLE "user_department_assignments" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "role_code" "DepartmentStaffRole" NOT NULL DEFAULT 'OPERATOR',
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(3),
  "assigned_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_department_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_department_assignments_user_id_department_id_key"
  ON "user_department_assignments"("user_id", "department_id");
CREATE INDEX "user_department_assignments_department_id_is_active_idx"
  ON "user_department_assignments"("department_id", "is_active");
CREATE INDEX "user_department_assignments_user_id_is_active_idx"
  ON "user_department_assignments"("user_id", "is_active");

ALTER TABLE "user_department_assignments"
  ADD CONSTRAINT "user_department_assignments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_department_assignments"
  ADD CONSTRAINT "user_department_assignments_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_department_assignments"
  ADD CONSTRAINT "user_department_assignments_assigned_by_id_fkey"
  FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "workflow_task_assignments" (
  "id" TEXT NOT NULL,
  "workflow_task_id" TEXT NOT NULL,
  "operator_id" TEXT NOT NULL,
  "department_id" TEXT NOT NULL,
  "machine_id" TEXT,
  "assigned_by_id" TEXT NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "priority" "WorkflowPriority" NOT NULL DEFAULT 'NORMAL',
  "due_at" TIMESTAMP(3),
  "estimated_minutes" INTEGER NOT NULL,
  "remarks" TEXT,
  "status" "WorkflowTaskAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "superseded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_task_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_task_assignments_workflow_task_id_status_idx"
  ON "workflow_task_assignments"("workflow_task_id", "status");
CREATE INDEX "workflow_task_assignments_operator_id_status_idx"
  ON "workflow_task_assignments"("operator_id", "status");
CREATE INDEX "workflow_task_assignments_department_id_status_idx"
  ON "workflow_task_assignments"("department_id", "status");
CREATE INDEX "workflow_task_assignments_assigned_at_idx"
  ON "workflow_task_assignments"("assigned_at" DESC);

CREATE UNIQUE INDEX "workflow_task_assignments_one_active_per_task_idx"
  ON "workflow_task_assignments"("workflow_task_id")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "workflow_task_assignments"
  ADD CONSTRAINT "workflow_task_assignments_workflow_task_id_fkey"
  FOREIGN KEY ("workflow_task_id") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_task_assignments"
  ADD CONSTRAINT "workflow_task_assignments_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_task_assignments"
  ADD CONSTRAINT "workflow_task_assignments_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_task_assignments"
  ADD CONSTRAINT "workflow_task_assignments_machine_id_fkey"
  FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_task_assignments"
  ADD CONSTRAINT "workflow_task_assignments_assigned_by_id_fkey"
  FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "workflow_task_assignment_history" (
  "id" TEXT NOT NULL,
  "assignment_id" TEXT,
  "workflow_task_id" TEXT NOT NULL,
  "action" "WorkflowTaskAssignmentHistoryAction" NOT NULL,
  "operator_id" TEXT,
  "previous_operator_id" TEXT,
  "priority" "WorkflowPriority",
  "previous_priority" "WorkflowPriority",
  "due_at" TIMESTAMP(3),
  "previous_due_at" TIMESTAMP(3),
  "remarks" TEXT,
  "previous_remarks" TEXT,
  "machine_id" TEXT,
  "previous_machine_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "performed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_task_assignment_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_task_assignment_history_workflow_task_id_created_at_idx"
  ON "workflow_task_assignment_history"("workflow_task_id", "created_at" DESC);
CREATE INDEX "workflow_task_assignment_history_assignment_id_idx"
  ON "workflow_task_assignment_history"("assignment_id");
CREATE INDEX "workflow_task_assignment_history_performed_by_id_idx"
  ON "workflow_task_assignment_history"("performed_by_id");

ALTER TABLE "workflow_task_assignment_history"
  ADD CONSTRAINT "workflow_task_assignment_history_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "workflow_task_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_task_assignment_history"
  ADD CONSTRAINT "workflow_task_assignment_history_workflow_task_id_fkey"
  FOREIGN KEY ("workflow_task_id") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_task_assignment_history"
  ADD CONSTRAINT "workflow_task_assignment_history_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_task_assignment_history"
  ADD CONSTRAINT "workflow_task_assignment_history_performed_by_id_fkey"
  FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

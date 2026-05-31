-- Product Engine Phase 6 — Order + Workflow Execution Engine

CREATE TYPE "ProductionOrderStatus" AS ENUM (
  'DRAFT',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'ON_HOLD',
  'COMPLETED',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED'
);

CREATE TYPE "WorkflowInstanceStatus" AS ENUM (
  'READY',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'ON_HOLD'
);

CREATE TYPE "WorkflowHistoryAction" AS ENUM (
  'CREATED',
  'ASSIGNED',
  'STARTED',
  'COMPLETED',
  'REJECTED',
  'REWORKED',
  'ON_HOLD',
  'COMMENT_ADDED'
);

CREATE TYPE "ReworkStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_name" TEXT,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,
    "price_snapshot_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "production_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_item_configurations" (
    "id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "field_code" TEXT NOT NULL,
    "field_label" TEXT NOT NULL,
    "selected_value" TEXT NOT NULL,
    "selected_label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_item_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_item_files" (
    "id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "file_requirement_code" TEXT NOT NULL,
    "file_requirement_label" TEXT NOT NULL,
    "file_asset_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_item_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_instances" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "workflow_template_id" TEXT NOT NULL,
    "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'READY',
    "current_step_order" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_tasks" (
    "id" TEXT NOT NULL,
    "workflow_instance_id" TEXT NOT NULL,
    "workflow_template_step_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_task_history" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "action" "WorkflowHistoryAction" NOT NULL,
    "remarks" TEXT,
    "performed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_task_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rework_requests" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "status" "ReworkStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rework_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_sla_breaches" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "expected_minutes" INTEGER NOT NULL,
    "actual_minutes" INTEGER NOT NULL,
    "breach_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_sla_breaches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_orders_order_number_key"
    ON "production_orders"("order_number");
CREATE INDEX "production_orders_customer_id_idx"
    ON "production_orders"("customer_id");
CREATE INDEX "production_orders_status_idx"
    ON "production_orders"("status");
CREATE INDEX "production_orders_order_number_idx"
    ON "production_orders"("order_number");

CREATE INDEX "production_order_items_order_id_idx"
    ON "production_order_items"("order_id");
CREATE INDEX "production_order_items_offering_id_idx"
    ON "production_order_items"("offering_id");
CREATE INDEX "production_order_items_price_snapshot_id_idx"
    ON "production_order_items"("price_snapshot_id");

CREATE INDEX "order_item_configurations_order_item_id_idx"
    ON "order_item_configurations"("order_item_id");

CREATE INDEX "order_item_files_order_item_id_idx"
    ON "order_item_files"("order_item_id");
CREATE INDEX "order_item_files_file_asset_id_idx"
    ON "order_item_files"("file_asset_id");

CREATE INDEX "workflow_instances_order_id_idx"
    ON "workflow_instances"("order_id");
CREATE INDEX "workflow_instances_workflow_template_id_idx"
    ON "workflow_instances"("workflow_template_id");
CREATE INDEX "workflow_instances_status_idx"
    ON "workflow_instances"("status");

CREATE INDEX "workflow_tasks_workflow_instance_id_idx"
    ON "workflow_tasks"("workflow_instance_id");
CREATE INDEX "workflow_tasks_department_id_idx"
    ON "workflow_tasks"("department_id");
CREATE INDEX "workflow_tasks_assigned_to_id_idx"
    ON "workflow_tasks"("assigned_to_id");
CREATE INDEX "workflow_tasks_status_idx"
    ON "workflow_tasks"("status");

CREATE INDEX "workflow_task_history_task_id_idx"
    ON "workflow_task_history"("task_id");
CREATE INDEX "workflow_task_history_performed_by_id_idx"
    ON "workflow_task_history"("performed_by_id");

CREATE INDEX "rework_requests_task_id_idx"
    ON "rework_requests"("task_id");
CREATE INDEX "rework_requests_created_by_id_idx"
    ON "rework_requests"("created_by_id");
CREATE INDEX "rework_requests_status_idx"
    ON "rework_requests"("status");

CREATE INDEX "workflow_sla_breaches_task_id_idx"
    ON "workflow_sla_breaches"("task_id");

ALTER TABLE "production_orders"
    ADD CONSTRAINT "production_orders_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_order_items"
    ADD CONSTRAINT "production_order_items_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "production_order_items"
    ADD CONSTRAINT "production_order_items_offering_id_fkey"
    FOREIGN KEY ("offering_id") REFERENCES "product_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_order_items"
    ADD CONSTRAINT "production_order_items_price_snapshot_id_fkey"
    FOREIGN KEY ("price_snapshot_id") REFERENCES "price_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_item_configurations"
    ADD CONSTRAINT "order_item_configurations_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "production_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_item_files"
    ADD CONSTRAINT "order_item_files_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "production_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_item_files"
    ADD CONSTRAINT "order_item_files_file_asset_id_fkey"
    FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_instances"
    ADD CONSTRAINT "workflow_instances_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_instances"
    ADD CONSTRAINT "workflow_instances_workflow_template_id_fkey"
    FOREIGN KEY ("workflow_template_id") REFERENCES "workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_tasks"
    ADD CONSTRAINT "workflow_tasks_workflow_instance_id_fkey"
    FOREIGN KEY ("workflow_instance_id") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_tasks"
    ADD CONSTRAINT "workflow_tasks_workflow_template_step_id_fkey"
    FOREIGN KEY ("workflow_template_step_id") REFERENCES "workflow_template_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_tasks"
    ADD CONSTRAINT "workflow_tasks_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_tasks"
    ADD CONSTRAINT "workflow_tasks_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_task_history"
    ADD CONSTRAINT "workflow_task_history_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_task_history"
    ADD CONSTRAINT "workflow_task_history_performed_by_id_fkey"
    FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rework_requests"
    ADD CONSTRAINT "rework_requests_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rework_requests"
    ADD CONSTRAINT "rework_requests_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_sla_breaches"
    ADD CONSTRAINT "workflow_sla_breaches_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

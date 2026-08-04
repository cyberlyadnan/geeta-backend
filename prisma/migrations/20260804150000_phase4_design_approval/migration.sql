-- Phase 4 product type profiles + wedding-card design-approval flow.
-- See docs/features/06-phase4-wedding-card-design-flow.md and
-- phase4-wedding-card-design-flow-as-built.md.

-- New workflow step type: a gate the vendor closes, not an operator.
ALTER TYPE "WorkflowStepType" ADD VALUE IF NOT EXISTS 'VENDOR_APPROVAL';

CREATE TYPE "ProductSizeMode" AS ENUM ('CONFIG', 'ROLL_BASED', 'FIXED');
CREATE TYPE "DesignTaskSource" AS ENUM ('VENDOR_ARTWORK', 'VENDOR_MATTER');
CREATE TYPE "DesignTaskStatus" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'AWAITING_VENDOR_APPROVAL',
  'REVISION_REQUESTED',
  'APPROVED'
);
CREATE TYPE "DesignApprovalGate" AS ENUM ('DIGITAL_PROOF', 'PHYSICAL_SAMPLE');

-- 4A: ProductTypeProfile
CREATE TABLE "product_type_profiles" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "size_mode" "ProductSizeMode" NOT NULL,
  "pricing_strategy_key" TEXT NOT NULL,
  "wizard_steps_key" TEXT NOT NULL,
  "requires_design_approval" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_type_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_type_profiles_key_key" ON "product_type_profiles"("key");

-- 4B: catalog products carry a profile and a flat price.
ALTER TABLE "product_offering_versions"
  ADD COLUMN "product_type_profile_id" TEXT,
  ADD COLUMN "fixed_price" DECIMAL(12, 2);

CREATE INDEX "product_offering_versions_product_type_profile_id_idx"
  ON "product_offering_versions"("product_type_profile_id");

ALTER TABLE "product_offering_versions"
  ADD CONSTRAINT "product_offering_versions_product_type_profile_id_fkey"
  FOREIGN KEY ("product_type_profile_id") REFERENCES "product_type_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4C: DesignTask — one per order, referencing production_orders (not the legacy orders table).
CREATE TABLE "design_tasks" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "source" "DesignTaskSource" NOT NULL,
  "matter_content" TEXT,
  "assigned_to_user_id" TEXT,
  "status" "DesignTaskStatus" NOT NULL DEFAULT 'PENDING',
  "proof_url" TEXT,
  "revision_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "design_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "design_tasks_order_id_key" ON "design_tasks"("order_id");
CREATE INDEX "design_tasks_status_idx" ON "design_tasks"("status");
CREATE INDEX "design_tasks_assigned_to_user_id_idx" ON "design_tasks"("assigned_to_user_id");

ALTER TABLE "design_tasks"
  ADD CONSTRAINT "design_tasks_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "production_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "design_tasks"
  ADD CONSTRAINT "design_tasks_assigned_to_user_id_fkey"
  FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Proof history, so a vendor can see what changed between revision rounds.
CREATE TABLE "design_proof_versions" (
  "id" TEXT NOT NULL,
  "design_task_id" TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "proof_url" TEXT NOT NULL,
  "notes" TEXT,
  "submitted_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "design_proof_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "design_proof_versions_design_task_id_version_number_key"
  ON "design_proof_versions"("design_task_id", "version_number");
CREATE INDEX "design_proof_versions_design_task_id_idx" ON "design_proof_versions"("design_task_id");

ALTER TABLE "design_proof_versions"
  ADD CONSTRAINT "design_proof_versions_design_task_id_fkey"
  FOREIGN KEY ("design_task_id") REFERENCES "design_tasks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "design_proof_versions"
  ADD CONSTRAINT "design_proof_versions_submitted_by_id_fkey"
  FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audit trail of vendor decisions at both gates.
CREATE TABLE "design_approval_decisions" (
  "id" TEXT NOT NULL,
  "design_task_id" TEXT NOT NULL,
  "gate" "DesignApprovalGate" NOT NULL,
  "approved" BOOLEAN NOT NULL,
  "revision_note" TEXT,
  "decided_by_user_id" TEXT NOT NULL,
  "workflow_task_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "design_approval_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "design_approval_decisions_design_task_id_created_at_idx"
  ON "design_approval_decisions"("design_task_id", "created_at" DESC);

ALTER TABLE "design_approval_decisions"
  ADD CONSTRAINT "design_approval_decisions_design_task_id_fkey"
  FOREIGN KEY ("design_task_id") REFERENCES "design_tasks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "design_approval_decisions"
  ADD CONSTRAINT "design_approval_decisions_decided_by_user_id_fkey"
  FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

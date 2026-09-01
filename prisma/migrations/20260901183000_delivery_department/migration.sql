-- Phase 7 — Delivery department: services, vendor tags, agents, consignments.
-- Schema was added without a migration; admin delivery APIs 500 until these tables exist.
-- RoleName enum values live in 20260901182900_delivery_department_enums.

CREATE TYPE "DeliveryServiceKind" AS ENUM (
  'LOCAL',
  'INTERSTATE',
  'COURIER',
  'BUS',
  'RAIL',
  'AIR',
  'SELF_PICKUP',
  'OTHER'
);

CREATE TYPE "DeliveryAssignmentStatus" AS ENUM (
  'UNASSIGNED',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'RETURNED',
  'CANCELLED'
);

CREATE TYPE "DeliveryAttemptOutcome" AS ENUM (
  'DELIVERED',
  'FAILED'
);

CREATE TABLE "delivery_services" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "DeliveryServiceKind" NOT NULL DEFAULT 'OTHER',
  "description" TEXT,
  "color_hex" TEXT NOT NULL DEFAULT '#4f46e5',
  "requires_tracking_number" BOOLEAN NOT NULL DEFAULT false,
  "sla_hours" INTEGER,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "delivery_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_services_code_key" ON "delivery_services"("code");
CREATE INDEX "delivery_services_is_active_sort_order_idx" ON "delivery_services"("is_active", "sort_order");

ALTER TABLE "delivery_services"
  ADD CONSTRAINT "delivery_services_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "vendor_delivery_services" (
  "id" TEXT NOT NULL,
  "vendor_profile_id" TEXT NOT NULL,
  "delivery_service_id" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vendor_delivery_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_delivery_services_vendor_profile_id_delivery_service_id_key"
  ON "vendor_delivery_services"("vendor_profile_id", "delivery_service_id");
CREATE INDEX "vendor_delivery_services_delivery_service_id_idx"
  ON "vendor_delivery_services"("delivery_service_id");
CREATE INDEX "vendor_delivery_services_vendor_profile_id_is_default_idx"
  ON "vendor_delivery_services"("vendor_profile_id", "is_default");

ALTER TABLE "vendor_delivery_services"
  ADD CONSTRAINT "vendor_delivery_services_vendor_profile_id_fkey"
  FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_delivery_services"
  ADD CONSTRAINT "vendor_delivery_services_delivery_service_id_fkey"
  FOREIGN KEY ("delivery_service_id") REFERENCES "delivery_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "delivery_agent_services" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "delivery_service_id" TEXT NOT NULL,
  "assigned_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "delivery_agent_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_agent_services_user_id_delivery_service_id_key"
  ON "delivery_agent_services"("user_id", "delivery_service_id");
CREATE INDEX "delivery_agent_services_delivery_service_id_idx"
  ON "delivery_agent_services"("delivery_service_id");

ALTER TABLE "delivery_agent_services"
  ADD CONSTRAINT "delivery_agent_services_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_agent_services"
  ADD CONSTRAINT "delivery_agent_services_assigned_by_id_fkey"
  FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "delivery_agent_services"
  ADD CONSTRAINT "delivery_agent_services_delivery_service_id_fkey"
  FOREIGN KEY ("delivery_service_id") REFERENCES "delivery_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "delivery_assignments" (
  "id" TEXT NOT NULL,
  "dispatch_batch_id" TEXT NOT NULL,
  "delivery_service_id" TEXT NOT NULL,
  "assigned_to_id" TEXT,
  "status" "DeliveryAssignmentStatus" NOT NULL DEFAULT 'UNASSIGNED',
  "tracking_number" TEXT,
  "receiver_name" TEXT,
  "receiver_phone" TEXT,
  "proof_photo_key" TEXT,
  "notes" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_failure_reason" TEXT,
  "due_at" TIMESTAMP(3),
  "assigned_at" TIMESTAMP(3),
  "picked_up_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "assigned_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_assignments_dispatch_batch_id_key"
  ON "delivery_assignments"("dispatch_batch_id");
CREATE INDEX "delivery_assignments_delivery_service_id_status_created_at_idx"
  ON "delivery_assignments"("delivery_service_id", "status", "created_at");
CREATE INDEX "delivery_assignments_assigned_to_id_status_idx"
  ON "delivery_assignments"("assigned_to_id", "status");
CREATE INDEX "delivery_assignments_status_due_at_idx"
  ON "delivery_assignments"("status", "due_at");

ALTER TABLE "delivery_assignments"
  ADD CONSTRAINT "delivery_assignments_dispatch_batch_id_fkey"
  FOREIGN KEY ("dispatch_batch_id") REFERENCES "dispatch_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_assignments"
  ADD CONSTRAINT "delivery_assignments_delivery_service_id_fkey"
  FOREIGN KEY ("delivery_service_id") REFERENCES "delivery_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_assignments"
  ADD CONSTRAINT "delivery_assignments_assigned_to_id_fkey"
  FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "delivery_assignments"
  ADD CONSTRAINT "delivery_assignments_assigned_by_id_fkey"
  FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "delivery_attempts" (
  "id" TEXT NOT NULL,
  "assignment_id" TEXT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "outcome" "DeliveryAttemptOutcome" NOT NULL,
  "reason" TEXT,
  "receiver_name" TEXT,
  "proof_photo_key" TEXT,
  "by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_attempts_assignment_id_attempt_number_key"
  ON "delivery_attempts"("assignment_id", "attempt_number");
CREATE INDEX "delivery_attempts_assignment_id_idx"
  ON "delivery_attempts"("assignment_id");

ALTER TABLE "delivery_attempts"
  ADD CONSTRAINT "delivery_attempts_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "delivery_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_attempts"
  ADD CONSTRAINT "delivery_attempts_by_user_id_fkey"
  FOREIGN KEY ("by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dispatch_batches"
  ADD COLUMN IF NOT EXISTS "delivery_service_id" TEXT;

CREATE INDEX IF NOT EXISTS "dispatch_batches_delivery_service_id_status_idx"
  ON "dispatch_batches"("delivery_service_id", "status");

DO $$ BEGIN
  ALTER TABLE "dispatch_batches"
    ADD CONSTRAINT "dispatch_batches_delivery_service_id_fkey"
    FOREIGN KEY ("delivery_service_id") REFERENCES "delivery_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

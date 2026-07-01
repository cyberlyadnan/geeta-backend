-- Milestone 7: Machine Registry & Capacity Management (Level 1)

CREATE TYPE "MachineOperationalStatus" AS ENUM (
  'AVAILABLE',
  'BUSY',
  'RESERVED',
  'MAINTENANCE',
  'OFFLINE'
);

ALTER TABLE "machines"
  ADD COLUMN "machine_type" TEXT,
  ADD COLUMN "manufacturer" TEXT,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "capabilities" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "supported_processes" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "min_sheet_width_mm" DECIMAL(10,2),
  ADD COLUMN "min_sheet_height_mm" DECIMAL(10,2),
  ADD COLUMN "max_sheet_width_mm" DECIMAL(10,2),
  ADD COLUMN "max_sheet_height_mm" DECIMAL(10,2),
  ADD COLUMN "max_print_width_mm" DECIMAL(10,2),
  ADD COLUMN "max_print_height_mm" DECIMAL(10,2),
  ADD COLUMN "speed_rating" TEXT,
  ADD COLUMN "capacity_per_hour" INTEGER,
  ADD COLUMN "working_hours" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "average_runtime_minutes" INTEGER,
  ADD COLUMN "supported_product_ids" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "operational_status" "MachineOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notes" TEXT;

UPDATE "machines"
SET "operational_status" = CASE
  WHEN "status" = 'MAINTENANCE' THEN 'MAINTENANCE'::"MachineOperationalStatus"
  WHEN "status" = 'INACTIVE' THEN 'OFFLINE'::"MachineOperationalStatus"
  WHEN "status" = 'DECOMMISSIONED' THEN 'OFFLINE'::"MachineOperationalStatus"
  ELSE 'AVAILABLE'::"MachineOperationalStatus"
END,
"is_active" = CASE
  WHEN "status" IN ('INACTIVE', 'DECOMMISSIONED') THEN false
  ELSE true
END;

CREATE TABLE "machine_status_history" (
  "id" TEXT NOT NULL,
  "machine_id" TEXT NOT NULL,
  "from_status" "MachineOperationalStatus",
  "to_status" "MachineOperationalStatus" NOT NULL,
  "reason" TEXT,
  "workflow_task_id" TEXT,
  "assignment_id" TEXT,
  "changed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "machine_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "machine_maintenance_records" (
  "id" TEXT NOT NULL,
  "machine_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL,
  "ended_at" TIMESTAMP(3),
  "performed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "machine_maintenance_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "machines_department_id_is_active_idx" ON "machines"("department_id", "is_active");
CREATE INDEX "machines_operational_status_idx" ON "machines"("operational_status");
CREATE INDEX "machines_is_active_operational_status_idx" ON "machines"("is_active", "operational_status");
CREATE INDEX "machine_status_history_machine_id_created_at_idx" ON "machine_status_history"("machine_id", "created_at" DESC);
CREATE INDEX "machine_maintenance_records_machine_id_started_at_idx" ON "machine_maintenance_records"("machine_id", "started_at" DESC);

ALTER TABLE "machine_status_history"
  ADD CONSTRAINT "machine_status_history_machine_id_fkey"
  FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "machine_status_history"
  ADD CONSTRAINT "machine_status_history_changed_by_id_fkey"
  FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "machine_maintenance_records"
  ADD CONSTRAINT "machine_maintenance_records_machine_id_fkey"
  FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "machine_maintenance_records"
  ADD CONSTRAINT "machine_maintenance_records_performed_by_id_fkey"
  FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'MACHINE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'MACHINE_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'MACHINE_ASSIGNED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'MACHINE_STATUS_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'MACHINE_ARCHIVED';

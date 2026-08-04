-- Phase 3 dispatch & delivery: shifts, per-vendor shift batching, dispatcher-priced delivery,
-- and consolidated sequential GST invoices.
-- See docs/features/05-phase3-dispatch-delivery.md and phase3-dispatch-delivery-as-built.md.

CREATE TYPE "DispatchBatchStatus" AS ENUM (
  'AWAITING_READY',
  'HELD_INSUFFICIENT_BALANCE',
  'READY',
  'DISPATCHED'
);

-- Recurring daily dispatch windows.
CREATE TABLE "delivery_shifts" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "cutoff_time" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "delivery_shifts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_shifts_is_active_cutoff_time_idx" ON "delivery_shifts"("is_active", "cutoff_time");

-- One batch per (actor, shift, dispatch day).
CREATE TABLE "dispatch_batches" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT,
  "retail_customer_id" TEXT,
  "shift_id" TEXT NOT NULL,
  "dispatch_date" TEXT NOT NULL,
  "status" "DispatchBatchStatus" NOT NULL DEFAULT 'AWAITING_READY',
  "delivery_charge" DECIMAL(12, 2),
  "held_shortfall" DECIMAL(12, 2),
  "held_at" TIMESTAMP(3),
  "billed_at" TIMESTAMP(3),
  "dispatched_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dispatch_batches_pkey" PRIMARY KEY ("id")
);

-- Postgres treats NULLs as distinct in unique indexes, which is exactly what is wanted here:
-- the vendor index dedupes vendor batches and ignores retail rows (vendor_id NULL), and the
-- retail index does the converse. Neither collapses the other actor kind into one row.
CREATE UNIQUE INDEX "dispatch_batches_vendor_id_shift_id_dispatch_date_key"
  ON "dispatch_batches"("vendor_id", "shift_id", "dispatch_date");
CREATE UNIQUE INDEX "dispatch_batches_retail_customer_id_shift_id_dispatch_date_key"
  ON "dispatch_batches"("retail_customer_id", "shift_id", "dispatch_date");
CREATE INDEX "dispatch_batches_status_dispatch_date_idx" ON "dispatch_batches"("status", "dispatch_date");
CREATE INDEX "dispatch_batches_shift_id_status_idx" ON "dispatch_batches"("shift_id", "status");

ALTER TABLE "dispatch_batches"
  ADD CONSTRAINT "dispatch_batches_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "delivery_shifts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dispatch_batches"
  ADD CONSTRAINT "dispatch_batches_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dispatch_batches"
  ADD CONSTRAINT "dispatch_batches_retail_customer_id_fkey"
  FOREIGN KEY ("retail_customer_id") REFERENCES "retail_customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A batch belongs to a vendor OR a retail customer, never both/neither — mirrors the same XOR
-- constraint production_orders carries (Prisma has no declarative XOR).
ALTER TABLE "dispatch_batches"
  ADD CONSTRAINT "dispatch_batches_vendor_xor_retail_customer_check"
  CHECK (
    ("vendor_id" IS NOT NULL AND "retail_customer_id" IS NULL) OR
    ("vendor_id" IS NULL AND "retail_customer_id" IS NOT NULL)
  );

-- An order belongs to exactly one batch (enforced by the unique on order_id).
CREATE TABLE "dispatch_batch_orders" (
  "id" TEXT NOT NULL,
  "dispatch_batch_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dispatch_batch_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispatch_batch_orders_order_id_key" ON "dispatch_batch_orders"("order_id");
CREATE INDEX "dispatch_batch_orders_dispatch_batch_id_idx" ON "dispatch_batch_orders"("dispatch_batch_id");

ALTER TABLE "dispatch_batch_orders"
  ADD CONSTRAINT "dispatch_batch_orders_dispatch_batch_id_fkey"
  FOREIGN KEY ("dispatch_batch_id") REFERENCES "dispatch_batches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dispatch_batch_orders"
  ADD CONSTRAINT "dispatch_batch_orders_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "production_orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Consolidated GST invoice, one per batch.
CREATE TABLE "invoices" (
  "id" TEXT NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "dispatch_batch_id" TEXT NOT NULL,
  "actor_type" "FinancialActorType" NOT NULL,
  "actor_id" TEXT NOT NULL,
  "gst_number" TEXT,
  "billed_to_name" TEXT NOT NULL,
  "subtotal" DECIMAL(12, 2) NOT NULL,
  "delivery_charge" DECIMAL(12, 2) NOT NULL,
  "gst_rate" DECIMAL(5, 4) NOT NULL,
  "gst_amount" DECIMAL(12, 2) NOT NULL,
  "total" DECIMAL(12, 2) NOT NULL,
  "pdf_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");
CREATE UNIQUE INDEX "invoices_dispatch_batch_id_key" ON "invoices"("dispatch_batch_id");
CREATE INDEX "invoices_actor_type_actor_id_created_at_idx" ON "invoices"("actor_type", "actor_id", "created_at" DESC);

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_dispatch_batch_id_fkey"
  FOREIGN KEY ("dispatch_batch_id") REFERENCES "dispatch_batches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Gapless per-year invoice counter, same shape as order_number_sequences.
CREATE TABLE "invoice_number_sequences" (
  "year" INTEGER NOT NULL,
  "last_value" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "invoice_number_sequences_pkey" PRIMARY KEY ("year")
);

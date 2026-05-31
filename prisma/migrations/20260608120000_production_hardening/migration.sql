-- Production hardening: config snapshots, workflow queue timing, quote traceability, job card snapshot

ALTER TABLE "order_item_configurations"
  ADD COLUMN "field_type" TEXT,
  ADD COLUMN "option_id" TEXT;

CREATE INDEX "order_item_configurations_option_id_idx"
  ON "order_item_configurations"("option_id");
CREATE INDEX "order_item_configurations_field_code_idx"
  ON "order_item_configurations"("field_code");

ALTER TABLE "workflow_tasks"
  ADD COLUMN "queued_at" TIMESTAMP(3),
  ADD COLUMN "assigned_at" TIMESTAMP(3);

CREATE INDEX "workflow_tasks_queued_at_idx" ON "workflow_tasks"("queued_at");
CREATE INDEX "workflow_tasks_assigned_at_idx" ON "workflow_tasks"("assigned_at");

ALTER TABLE "production_orders"
  ADD COLUMN "quote_id" TEXT;

CREATE INDEX "production_orders_quote_id_idx" ON "production_orders"("quote_id");

ALTER TABLE "production_orders"
  ADD CONSTRAINT "production_orders_quote_id_fkey"
  FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "production_job_cards"
  ADD COLUMN "snapshot" JSONB NOT NULL DEFAULT '{}';

-- Reprint flags on production orders (support / vendor reports filter free reprints).
-- Schema had isReprint + reprintOfOrderId but no migration was generated.

ALTER TABLE "production_orders"
  ADD COLUMN IF NOT EXISTS "is_reprint" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reprint_of_order_id" TEXT;

CREATE INDEX IF NOT EXISTS "production_orders_is_reprint_created_at_idx"
  ON "production_orders" ("is_reprint", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "production_orders_reprint_of_order_id_idx"
  ON "production_orders" ("reprint_of_order_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_reprint_of_order_id_fkey'
  ) THEN
    ALTER TABLE "production_orders"
      ADD CONSTRAINT "production_orders_reprint_of_order_id_fkey"
      FOREIGN KEY ("reprint_of_order_id") REFERENCES "production_orders"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

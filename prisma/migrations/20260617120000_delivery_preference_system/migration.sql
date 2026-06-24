-- Delivery preference & order delivery management

-- CreateEnum
CREATE TYPE "DeliveryPreference" AS ENUM ('ALWAYS_DELIVERY_REQUIRED', 'SELF_PICKUP_ONLY', 'ASK_ON_EVERY_ORDER');
CREATE TYPE "DeliveryType" AS ENUM ('DELIVERY', 'SELF_PICKUP');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SCHEDULED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- AlterEnum ActivityAction
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VENDOR_DELIVERY_PREFERENCE_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'DELIVERY_SETTINGS_UPDATED';

-- VendorProfile delivery preference
ALTER TABLE "vendor_profiles" ADD COLUMN IF NOT EXISTS "delivery_preference" "DeliveryPreference" NOT NULL DEFAULT 'ASK_ON_EVERY_ORDER';
CREATE INDEX IF NOT EXISTS "vendor_profiles_delivery_preference_idx" ON "vendor_profiles"("delivery_preference");

-- Delivery settings singleton
CREATE TABLE IF NOT EXISTS "delivery_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "default_delivery_charge" DECIMAL(12,2) NOT NULL DEFAULT 100,
    "is_delivery_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
    "future_config" JSONB NOT NULL DEFAULT '{}',
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "delivery_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "delivery_settings" ("id", "default_delivery_charge", "is_delivery_enabled", "is_pickup_enabled", "future_config", "updated_at")
VALUES ('default', 100, true, true, '{}', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

DO $$ BEGIN
  ALTER TABLE "delivery_settings" ADD CONSTRAINT "delivery_settings_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Production order delivery fields
ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "delivery_charge" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "delivery_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "delivery_type" "DeliveryType";
ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "delivery_address" TEXT;
ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "delivery_status" "DeliveryStatus";

-- Channel partner programme: partner profiles, vendor assignments, commission plans.
-- Schema was added without a migration; promote-to-partner failed until these tables exist.

CREATE TYPE "ChannelPartnerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TYPE "ChannelPartnerLinkSource" AS ENUM ('REFERRAL_CODE', 'ADMIN_ASSIGNED', 'PARTNER_CLAIMED');

CREATE TYPE "CommissionBasis" AS ENUM ('ORDER_SUBTOTAL', 'ORDER_GRAND_TOTAL');

CREATE TYPE "CommissionPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

CREATE TABLE "channel_partner_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "partner_code" TEXT NOT NULL,
    "status" "ChannelPartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "display_name" TEXT,
    "notes" TEXT,
    "promoted_by_id" TEXT,
    "promoted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_partner_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "channel_partner_assignments" (
    "id" TEXT NOT NULL,
    "partner_profile_id" TEXT NOT NULL,
    "vendor_user_id" TEXT NOT NULL,
    "source" "ChannelPartnerLinkSource" NOT NULL DEFAULT 'ADMIN_ASSIGNED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_by_id" TEXT,
    "ended_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "channel_partner_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "channel_partner_commission_plans" (
    "id" TEXT NOT NULL,
    "partner_profile_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basis" "CommissionBasis" NOT NULL DEFAULT 'ORDER_SUBTOTAL',
    "rate_percent" DECIMAL(5,2) NOT NULL,
    "min_order_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "monthly_cap" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "CommissionPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_partner_commission_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_partner_profiles_user_id_key" ON "channel_partner_profiles"("user_id");

CREATE UNIQUE INDEX "channel_partner_profiles_partner_code_key" ON "channel_partner_profiles"("partner_code");

CREATE INDEX "channel_partner_profiles_status_idx" ON "channel_partner_profiles"("status");

CREATE UNIQUE INDEX "channel_partner_assignments_partner_profile_id_vendor_user_id_key" ON "channel_partner_assignments"("partner_profile_id", "vendor_user_id");

CREATE INDEX "channel_partner_assignments_vendor_user_id_is_active_idx" ON "channel_partner_assignments"("vendor_user_id", "is_active");

CREATE INDEX "channel_partner_assignments_partner_profile_id_is_active_idx" ON "channel_partner_assignments"("partner_profile_id", "is_active");

CREATE INDEX "channel_partner_commission_plans_partner_profile_id_status_idx" ON "channel_partner_commission_plans"("partner_profile_id", "status");

ALTER TABLE "channel_partner_profiles" ADD CONSTRAINT "channel_partner_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "channel_partner_profiles" ADD CONSTRAINT "channel_partner_profiles_promoted_by_id_fkey" FOREIGN KEY ("promoted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "channel_partner_assignments" ADD CONSTRAINT "channel_partner_assignments_partner_profile_id_fkey" FOREIGN KEY ("partner_profile_id") REFERENCES "channel_partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "channel_partner_assignments" ADD CONSTRAINT "channel_partner_assignments_vendor_user_id_fkey" FOREIGN KEY ("vendor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "channel_partner_assignments" ADD CONSTRAINT "channel_partner_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "channel_partner_assignments" ADD CONSTRAINT "channel_partner_assignments_ended_by_id_fkey" FOREIGN KEY ("ended_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "channel_partner_commission_plans" ADD CONSTRAINT "channel_partner_commission_plans_partner_profile_id_fkey" FOREIGN KEY ("partner_profile_id") REFERENCES "channel_partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "channel_partner_commission_plans" ADD CONSTRAINT "channel_partner_commission_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "VendorAccountStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'UNDER_REVIEW', 'DOCUMENT_REQUIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('VENDOR_REGISTERED', 'VENDOR_STATUS_CHANGED', 'VENDOR_VERIFIED', 'VENDOR_REJECTED', 'VENDOR_SUSPENDED', 'ADMIN_NOTE_ADDED', 'USER_LOGIN', 'USER_LOGIN_BLOCKED', 'USER_CREATED');

-- AlterTable
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");

-- CreateTable
CREATE TABLE "vendor_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "alternate_phone" TEXT,
    "gst_number" TEXT,
    "reference_code" TEXT,
    "employee_code" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "state" TEXT,
    "district" TEXT,
    "city" TEXT,
    "pin_code" TEXT NOT NULL,
    "full_address" TEXT NOT NULL,
    "business_type" TEXT,
    "services" JSONB NOT NULL DEFAULT '[]',
    "account_status" "VendorAccountStatus" NOT NULL DEFAULT 'PENDING',
    "verification_remarks" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejected_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notes" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "vendor_profile_id" TEXT,
    "actor_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_profiles_user_id_key" ON "vendor_profiles"("user_id");

-- CreateIndex
CREATE INDEX "vendor_profiles_account_status_idx" ON "vendor_profiles"("account_status");

-- CreateIndex
CREATE INDEX "vendor_profiles_business_name_idx" ON "vendor_profiles"("business_name");

-- CreateIndex
CREATE INDEX "vendor_profiles_created_at_idx" ON "vendor_profiles"("created_at");

-- CreateIndex
CREATE INDEX "admin_notes_vendor_profile_id_idx" ON "admin_notes"("vendor_profile_id");

-- CreateIndex
CREATE INDEX "admin_notes_author_id_idx" ON "admin_notes"("author_id");

-- CreateIndex
CREATE INDEX "admin_notes_created_at_idx" ON "admin_notes"("created_at");

-- CreateIndex
CREATE INDEX "activity_logs_vendor_profile_id_idx" ON "activity_logs"("vendor_profile_id");

-- CreateIndex
CREATE INDEX "activity_logs_entity_type_entity_id_idx" ON "activity_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- AddForeignKey
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_vendor_profile_id_fkey" FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

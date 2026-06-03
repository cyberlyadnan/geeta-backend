-- Vendor compliance — dynamic document & question requests

CREATE TYPE "VendorComplianceRequestStatus" AS ENUM (
  'DRAFT',
  'PENDING_VENDOR',
  'PARTIALLY_SUBMITTED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "VendorComplianceItemType" AS ENUM ('DOCUMENT', 'QUESTION');

CREATE TYPE "VendorComplianceResponseStatus" AS ENUM (
  'PENDING',
  'SUBMITTED',
  'APPROVED',
  'REJECTED'
);

ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VENDOR_COMPLIANCE_REQUEST_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VENDOR_COMPLIANCE_REQUEST_SENT';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'VENDOR_COMPLIANCE_SUBMITTED';

CREATE TABLE "vendor_compliance_requests" (
    "id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "reference_code" TEXT NOT NULL,
    "title" TEXT,
    "instructions" TEXT,
    "status" "VendorComplianceRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "due_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_compliance_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendor_compliance_request_items" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "item_type" "VendorComplianceItemType" NOT NULL,
    "code" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "max_file_size_mb" INTEGER,
    "accepted_file_types" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_compliance_request_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendor_compliance_responses" (
    "id" TEXT NOT NULL,
    "request_item_id" TEXT NOT NULL,
    "vendor_profile_id" TEXT NOT NULL,
    "text_answer" TEXT,
    "file_asset_id" TEXT,
    "status" "VendorComplianceResponseStatus" NOT NULL DEFAULT 'SUBMITTED',
    "admin_remarks" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vendor_compliance_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendor_compliance_requests_reference_code_key"
    ON "vendor_compliance_requests"("reference_code");
CREATE INDEX "vendor_compliance_requests_vendor_profile_id_idx"
    ON "vendor_compliance_requests"("vendor_profile_id");
CREATE INDEX "vendor_compliance_requests_status_idx"
    ON "vendor_compliance_requests"("status");
CREATE INDEX "vendor_compliance_requests_created_at_idx"
    ON "vendor_compliance_requests"("created_at");

CREATE INDEX "vendor_compliance_request_items_request_id_idx"
    ON "vendor_compliance_request_items"("request_id");
CREATE INDEX "vendor_compliance_request_items_item_type_idx"
    ON "vendor_compliance_request_items"("item_type");

CREATE UNIQUE INDEX "vendor_compliance_responses_request_item_id_vendor_profile_id_key"
    ON "vendor_compliance_responses"("request_item_id", "vendor_profile_id");
CREATE INDEX "vendor_compliance_responses_vendor_profile_id_idx"
    ON "vendor_compliance_responses"("vendor_profile_id");
CREATE INDEX "vendor_compliance_responses_file_asset_id_idx"
    ON "vendor_compliance_responses"("file_asset_id");
CREATE INDEX "vendor_compliance_responses_status_idx"
    ON "vendor_compliance_responses"("status");

ALTER TABLE "vendor_compliance_requests"
    ADD CONSTRAINT "vendor_compliance_requests_vendor_profile_id_fkey"
    FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_compliance_requests"
    ADD CONSTRAINT "vendor_compliance_requests_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_compliance_requests"
    ADD CONSTRAINT "vendor_compliance_requests_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vendor_compliance_request_items"
    ADD CONSTRAINT "vendor_compliance_request_items_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "vendor_compliance_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_compliance_responses"
    ADD CONSTRAINT "vendor_compliance_responses_request_item_id_fkey"
    FOREIGN KEY ("request_item_id") REFERENCES "vendor_compliance_request_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_compliance_responses"
    ADD CONSTRAINT "vendor_compliance_responses_vendor_profile_id_fkey"
    FOREIGN KEY ("vendor_profile_id") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_compliance_responses"
    ADD CONSTRAINT "vendor_compliance_responses_file_asset_id_fkey"
    FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendor_compliance_responses"
    ADD CONSTRAINT "vendor_compliance_responses_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

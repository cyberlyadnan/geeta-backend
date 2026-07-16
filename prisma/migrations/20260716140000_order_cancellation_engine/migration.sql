-- Order Cancellation Engine

-- AlterEnum: add CANCELLATION_REQUESTED to ProductionOrderStatus
ALTER TYPE "ProductionOrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLATION_REQUESTED';

-- CreateEnum
CREATE TYPE "CancellationStageKey" AS ENUM ('VERIFICATION', 'ARTWORK_APPROVED', 'PRODUCTION', 'DISPATCH', 'COMPLETED');
CREATE TYPE "OrderCancellationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "OrderCancellationRequestType" AS ENUM ('DIRECT_CANCEL', 'CANCELLATION_REQUEST');

-- CreateTable
CREATE TABLE "cancellation_reasons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cancellation_reasons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cancellation_policy_rules" (
    "id" TEXT NOT NULL,
    "stage_key" "CancellationStageKey" NOT NULL,
    "label" TEXT NOT NULL,
    "vendor_direct_cancel" BOOLEAN NOT NULL DEFAULT false,
    "vendor_request_allowed" BOOLEAN NOT NULL DEFAULT false,
    "manager_approval_required" BOOLEAN NOT NULL DEFAULT false,
    "cancellation_allowed" BOOLEAN NOT NULL DEFAULT true,
    "policy_explanation" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cancellation_policy_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_cancellation_requests" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "reason_id" TEXT NOT NULL,
    "remarks" TEXT,
    "status" "OrderCancellationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "request_type" "OrderCancellationRequestType" NOT NULL,
    "previous_order_status" "ProductionOrderStatus" NOT NULL,
    "policy_stage_key" "CancellationStageKey" NOT NULL,
    "context_snapshot" JSONB NOT NULL DEFAULT '{}',
    "decided_by_id" TEXT,
    "decision_remarks" TEXT,
    "decided_at" TIMESTAMP(3),
    "refund_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_cancellation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_reasons_code_key" ON "cancellation_reasons"("code");
CREATE INDEX "cancellation_reasons_is_active_sort_order_idx" ON "cancellation_reasons"("is_active", "sort_order");

CREATE UNIQUE INDEX "cancellation_policy_rules_stage_key_key" ON "cancellation_policy_rules"("stage_key");
CREATE INDEX "cancellation_policy_rules_is_active_sort_order_idx" ON "cancellation_policy_rules"("is_active", "sort_order");

CREATE INDEX "order_cancellation_requests_order_id_created_at_idx" ON "order_cancellation_requests"("order_id", "created_at" DESC);
CREATE INDEX "order_cancellation_requests_status_created_at_idx" ON "order_cancellation_requests"("status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "order_cancellation_requests" ADD CONSTRAINT "order_cancellation_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_cancellation_requests" ADD CONSTRAINT "order_cancellation_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_cancellation_requests" ADD CONSTRAINT "order_cancellation_requests_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "cancellation_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_cancellation_requests" ADD CONSTRAINT "order_cancellation_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default cancellation reasons
INSERT INTO "cancellation_reasons" ("id", "code", "label", "description", "sort_order", "is_active", "created_at", "updated_at") VALUES
  ('cr_ordered_mistake', 'ORDERED_BY_MISTAKE', 'Ordered by mistake', 'Vendor placed the order unintentionally', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cr_wrong_artwork', 'WRONG_ARTWORK', 'Wrong artwork', 'Incorrect artwork was uploaded', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cr_wrong_quantity', 'WRONG_QUANTITY', 'Wrong quantity', 'Quantity entered is incorrect', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cr_wrong_product', 'WRONG_PRODUCT', 'Wrong product', 'Wrong product or configuration selected', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cr_duplicate', 'DUPLICATE_ORDER', 'Duplicate order', 'Same order was placed more than once', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cr_pricing', 'PRICING_ISSUE', 'Pricing issue', 'Pricing or quotation mismatch', 60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cr_customer_mind', 'CUSTOMER_CHANGED_MIND', 'Customer changed mind', 'End customer no longer wants the order', 70, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cr_other', 'OTHER', 'Other', 'Other reason — please add remarks', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Seed default cancellation policy rules
INSERT INTO "cancellation_policy_rules" ("id", "stage_key", "label", "vendor_direct_cancel", "vendor_request_allowed", "manager_approval_required", "cancellation_allowed", "policy_explanation", "sort_order", "is_active", "created_at", "updated_at") VALUES
  ('cpr_verification', 'VERIFICATION', 'Artwork Verification', true, false, false, true, 'Orders in artwork verification can be cancelled immediately by the vendor. A reason is required.', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cpr_artwork_approved', 'ARTWORK_APPROVED', 'Artwork Approved', false, true, true, true, 'After artwork approval, cancellation requires production manager approval.', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cpr_production', 'PRODUCTION', 'Production', false, true, true, true, 'Production has started. Submit a cancellation request for manager review.', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cpr_dispatch', 'DISPATCH', 'Dispatch', false, true, true, false, 'Dispatch has started. Cancellation is generally not allowed and may be rejected.', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cpr_completed', 'COMPLETED', 'Completed', false, false, false, false, 'Completed or delivered orders cannot be cancelled through this workflow.', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Support desk: tickets, messages, attachments, events, runtime settings, ticket sequences.
-- Schema was added without a migration; reprint eligibility failed until these tables exist.

CREATE TYPE "SupportTicketType" AS ENUM ('REPRINT', 'OTHER');

CREATE TYPE "SupportTicketStatus" AS ENUM (
  'OPEN',
  'UNDER_REVIEW',
  'AWAITING_CUSTOMER',
  'APPROVED',
  'REJECTED',
  'RESOLVED',
  'CLOSED'
);

CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TYPE "SupportTicketCategory" AS ENUM (
  'PRINT_QUALITY',
  'COLOR_MISMATCH',
  'DAMAGED_IN_TRANSIT',
  'WRONG_PRODUCT',
  'SHORT_QUANTITY',
  'CUTTING_OR_FINISHING',
  'DELAY',
  'DELIVERY_ISSUE',
  'ARTWORK_ISSUE',
  'BILLING_ISSUE',
  'WALLET_ISSUE',
  'GENERAL_QUERY',
  'OTHER'
);

CREATE TYPE "SupportAttachmentKind" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT');

CREATE TYPE "SupportMessageAuthorType" AS ENUM ('VENDOR', 'STAFF', 'SYSTEM');

CREATE TYPE "SupportTicketChannel" AS ENUM (
  'VENDOR_PORTAL',
  'PHONE',
  'WHATSAPP',
  'EMAIL',
  'WALK_IN',
  'STAFF_RAISED'
);

CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "type" "SupportTicketType" NOT NULL,
    "category" "SupportTicketCategory" NOT NULL DEFAULT 'OTHER',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "channel" "SupportTicketChannel" NOT NULL DEFAULT 'VENDOR_PORTAL',
    "vendor_user_id" TEXT,
    "retail_customer_id" TEXT,
    "raised_by_id" TEXT NOT NULL,
    "order_id" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requested_quantity" INTEGER,
    "eligibility_snapshot" JSONB NOT NULL DEFAULT '{}',
    "reprint_order_id" TEXT,
    "reprint_charge_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "assigned_to_id" TEXT,
    "decision_remarks" TEXT,
    "internal_notes" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "first_responded_at" TIMESTAMP(3),
    "sla_due_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "satisfaction_rating" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_type" "SupportMessageAuthorType" NOT NULL,
    "author_user_id" TEXT,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_attachments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "message_id" TEXT,
    "kind" "SupportAttachmentKind" NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "thumbnail_key" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_events" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_customer_visible" BOOLEAN NOT NULL DEFAULT true,
    "actor_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "reprint_window_days" INTEGER NOT NULL DEFAULT 15,
    "reprint_requires_dispatch" BOOLEAN NOT NULL DEFAULT true,
    "response_sla_hours" INTEGER NOT NULL DEFAULT 24,
    "max_attachments_per_ticket" INTEGER NOT NULL DEFAULT 10,
    "max_image_size_mb" INTEGER NOT NULL DEFAULT 10,
    "max_video_size_mb" INTEGER NOT NULL DEFAULT 100,
    "auto_close_resolved_after_days" INTEGER NOT NULL DEFAULT 7,
    "reprint_free_by_default" BOOLEAN NOT NULL DEFAULT true,
    "support_phone" TEXT NOT NULL DEFAULT '',
    "support_email" TEXT NOT NULL DEFAULT '',
    "support_hours" TEXT NOT NULL DEFAULT '',
    "reprint_policy_content" JSONB NOT NULL DEFAULT '{}',
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_number_sequences" (
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "support_ticket_number_sequences_pkey" PRIMARY KEY ("year")
);

CREATE UNIQUE INDEX "support_tickets_ticket_number_key" ON "support_tickets"("ticket_number");

CREATE UNIQUE INDEX "support_tickets_reprint_order_id_key" ON "support_tickets"("reprint_order_id");

CREATE INDEX "support_tickets_vendor_user_id_created_at_idx" ON "support_tickets"("vendor_user_id", "created_at" DESC);

CREATE INDEX "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at" DESC);

CREATE INDEX "support_tickets_type_status_idx" ON "support_tickets"("type", "status");

CREATE INDEX "support_tickets_assigned_to_id_status_idx" ON "support_tickets"("assigned_to_id", "status");

CREATE INDEX "support_tickets_order_id_idx" ON "support_tickets"("order_id");

CREATE INDEX "support_tickets_sla_due_at_idx" ON "support_tickets"("sla_due_at");

CREATE INDEX "support_ticket_messages_ticket_id_created_at_idx" ON "support_ticket_messages"("ticket_id", "created_at");

CREATE INDEX "support_ticket_attachments_ticket_id_idx" ON "support_ticket_attachments"("ticket_id");

CREATE INDEX "support_ticket_attachments_message_id_idx" ON "support_ticket_attachments"("message_id");

CREATE INDEX "support_ticket_events_ticket_id_created_at_idx" ON "support_ticket_events"("ticket_id", "created_at");

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_vendor_user_id_fkey" FOREIGN KEY ("vendor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_retail_customer_id_fkey" FOREIGN KEY ("retail_customer_id") REFERENCES "retail_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_reprint_order_id_fkey" FOREIGN KEY ("reprint_order_id") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "support_ticket_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_settings" ADD CONSTRAINT "support_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

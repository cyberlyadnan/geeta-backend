-- CreateEnum
CREATE TYPE "ContactInquiryPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ContactInquiryActivityType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'NOTE_ADDED', 'READ');

-- AlterTable
ALTER TABLE "contact_inquiries" ADD COLUMN "reference_code" TEXT;
ALTER TABLE "contact_inquiries" ADD COLUMN "priority" "ContactInquiryPriority" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "contact_inquiries" ADD COLUMN "assigned_to_id" TEXT;
ALTER TABLE "contact_inquiries" ADD COLUMN "resolved_at" TIMESTAMP(3);
ALTER TABLE "contact_inquiries" ADD COLUMN "resolved_by_id" TEXT;

-- Backfill reference codes for existing rows
UPDATE "contact_inquiries"
SET "reference_code" = 'INQ-LEG-' || SUBSTRING("id", 1, 8)
WHERE "reference_code" IS NULL;

ALTER TABLE "contact_inquiries" ALTER COLUMN "reference_code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "contact_inquiries_reference_code_key" ON "contact_inquiries"("reference_code");
CREATE INDEX "contact_inquiries_priority_idx" ON "contact_inquiries"("priority");
CREATE INDEX "contact_inquiries_assigned_to_id_idx" ON "contact_inquiries"("assigned_to_id");

-- AddForeignKey
ALTER TABLE "contact_inquiries" ADD CONSTRAINT "contact_inquiries_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_inquiries" ADD CONSTRAINT "contact_inquiries_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "contact_inquiry_notes" (
    "id" TEXT NOT NULL,
    "inquiry_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_inquiry_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_inquiry_activities" (
    "id" TEXT NOT NULL,
    "inquiry_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "type" "ContactInquiryActivityType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_inquiry_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_inquiry_notes_inquiry_id_idx" ON "contact_inquiry_notes"("inquiry_id");
CREATE INDEX "contact_inquiry_notes_author_id_idx" ON "contact_inquiry_notes"("author_id");
CREATE INDEX "contact_inquiry_notes_created_at_idx" ON "contact_inquiry_notes"("created_at");
CREATE INDEX "contact_inquiry_activities_inquiry_id_idx" ON "contact_inquiry_activities"("inquiry_id");
CREATE INDEX "contact_inquiry_activities_type_idx" ON "contact_inquiry_activities"("type");
CREATE INDEX "contact_inquiry_activities_created_at_idx" ON "contact_inquiry_activities"("created_at");

-- AddForeignKey
ALTER TABLE "contact_inquiry_notes" ADD CONSTRAINT "contact_inquiry_notes_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "contact_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_inquiry_notes" ADD CONSTRAINT "contact_inquiry_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_inquiry_activities" ADD CONSTRAINT "contact_inquiry_activities_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "contact_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_inquiry_activities" ADD CONSTRAINT "contact_inquiry_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

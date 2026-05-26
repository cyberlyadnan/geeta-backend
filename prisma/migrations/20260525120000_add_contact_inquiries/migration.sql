-- CreateEnum
CREATE TYPE "ContactSubject" AS ENUM ('QUOTE', 'ORDER', 'PARTNERSHIP', 'SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactInquiryStatus" AS ENUM ('NEW', 'READ', 'IN_PROGRESS', 'RESOLVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "contact_inquiries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "company" TEXT,
    "subject" "ContactSubject" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ContactInquiryStatus" NOT NULL DEFAULT 'NEW',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_inquiries_status_idx" ON "contact_inquiries"("status");

-- CreateIndex
CREATE INDEX "contact_inquiries_subject_idx" ON "contact_inquiries"("subject");

-- CreateIndex
CREATE INDEX "contact_inquiries_created_at_idx" ON "contact_inquiries"("created_at");

-- CreateIndex
CREATE INDEX "contact_inquiries_email_idx" ON "contact_inquiries"("email");

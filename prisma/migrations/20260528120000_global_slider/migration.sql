-- Global slider slides (CMS)

CREATE TYPE "SlideStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SCHEDULED', 'EXPIRED');

CREATE TABLE "slider_slides" (
    "id" TEXT NOT NULL,
    "slider_key" TEXT NOT NULL DEFAULT 'global',
    "title" TEXT,
    "description" TEXT,
    "image_url" TEXT NOT NULL,
    "image_key" TEXT NOT NULL,
    "redirect_url" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "SlideStatus" NOT NULL DEFAULT 'INACTIVE',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slider_slides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "slider_slides_slider_key_idx" ON "slider_slides"("slider_key");
CREATE INDEX "slider_slides_slider_key_status_idx" ON "slider_slides"("slider_key", "status");
CREATE INDEX "slider_slides_slider_key_display_order_idx" ON "slider_slides"("slider_key", "display_order");
CREATE INDEX "slider_slides_status_idx" ON "slider_slides"("status");
CREATE INDEX "slider_slides_start_date_idx" ON "slider_slides"("start_date");
CREATE INDEX "slider_slides_end_date_idx" ON "slider_slides"("end_date");

ALTER TABLE "slider_slides" ADD CONSTRAINT "slider_slides_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "slider_slides" ADD CONSTRAINT "slider_slides_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

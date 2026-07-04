-- Add optional images to catalog Family and Series (schema already defines these fields).
ALTER TABLE "product_families" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
ALTER TABLE "product_families" ADD COLUMN IF NOT EXISTS "image_key" TEXT;

ALTER TABLE "product_series" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
ALTER TABLE "product_series" ADD COLUMN IF NOT EXISTS "image_key" TEXT;

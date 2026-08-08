-- Conditional page lists and section grouping for artwork slots.
-- Both nullable and additive: a slot without pages keeps behaving as a single-file upload.
ALTER TABLE "file_requirements" ADD COLUMN "pages" JSONB;
ALTER TABLE "file_requirements" ADD COLUMN "group_label" TEXT;

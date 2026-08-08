-- Conditional artwork slots.
-- Nullable and additive: existing rows keep NULL, which the resolver reads as "always required",
-- so every product behaves exactly as before until an admin sets a condition.
ALTER TABLE "file_requirements" ADD COLUMN "condition" JSONB;

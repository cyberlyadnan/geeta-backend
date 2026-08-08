-- Marks the question whose value stands in for the product name in the vendor's picker.
-- Defaulted false and additive, so existing products keep showing the product name.
ALTER TABLE "configuration_fields" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false;

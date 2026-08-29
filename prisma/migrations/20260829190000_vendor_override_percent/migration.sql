-- Allow vendor overrides as a percentage discount off list price (e.g. 5% off).
ALTER TYPE "VendorPriceOverrideType" ADD VALUE IF NOT EXISTS 'PERCENT';

-- Normalize legacy vendor member IDs (GP1002) to hyphenated form (GP-1002).
UPDATE vendor_profiles
SET vendor_code = 'GP-' || SUBSTRING(vendor_code FROM 3)
WHERE vendor_code ~ '^GP[0-9]+$';

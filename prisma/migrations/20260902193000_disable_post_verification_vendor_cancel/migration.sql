-- Vendors may cancel directly only during artwork verification.
-- Once production starts (artwork approved or later), vendor-initiated cancellation is blocked.
UPDATE "cancellation_policy_rules"
SET
  "vendor_request_allowed" = false,
  "vendor_direct_cancel" = false,
  "cancellation_allowed" = false,
  "policy_explanation" = 'Production has started. Contact support if you need to discuss this order.',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "stage_key" IN ('ARTWORK_APPROVED', 'PRODUCTION');

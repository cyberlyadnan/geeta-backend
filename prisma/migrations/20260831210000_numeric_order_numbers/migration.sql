-- Production order numbers: GP-2026-000047 → 000047 (6-digit numeric only).

-- Phase 1: temporary unique values so reassignment does not hit order_number unique constraint.
UPDATE production_orders SET order_number = 'TMP-' || id;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM production_orders
)
UPDATE production_orders AS po
SET order_number = LPAD(o.rn::text, 6, '0')
FROM ordered AS o
WHERE po.id = o.id;

INSERT INTO order_number_sequences (year, prefix, last_value)
SELECT 0, 'ORDER', COUNT(*)::int
FROM production_orders
ON CONFLICT (year, prefix) DO UPDATE
SET last_value = GREATEST(order_number_sequences.last_value, EXCLUDED.last_value);

-- Seed DELIVERY and SUPPORT roles after enum values exist.

INSERT INTO "roles" ("id", "name", "display_name", "description", "permissions", "is_system", "created_at", "updated_at")
VALUES
  (
    'role_delivery',
    'DELIVERY',
    'Delivery agent',
    'Delivery department — sees consignments on tagged services only',
    '["delivery:portal"]'::jsonb,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'role_support',
    'SUPPORT',
    'Support operator',
    'Support desk — ticket queue only',
    '["support:desk"]'::jsonb,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("name") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;

-- Enum values must commit before use in the same database session (PostgreSQL rule).
-- Split from the delivery_department tables migration for that reason.

ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'SUPPORT';
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'DELIVERY';

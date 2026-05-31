-- Add CANCELLED for vendor-abandoned or user-cancelled wallet recharges
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Wallet & Razorpay ledger system

ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "total_added" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "total_spent" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "total_refunds" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "last_recharge_at" TIMESTAMP(3);

ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'PROMOTIONAL';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'ORDER_PAYMENT';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'RECHARGE';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'ADMIN_CREDIT';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'ADMIN_DEBIT';

ALTER TYPE "WalletTransactionStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "WalletTransactionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'EXPIRED', 'REFUNDED');
CREATE TYPE "PaymentMethod" AS ENUM ('UPI_QR', 'UPI', 'CARD', 'NETBANKING', 'WALLET', 'OTHER');
CREATE TYPE "FinancialAuditAction" AS ENUM ('WALLET_CREDIT', 'WALLET_DEBIT', 'PAYMENT_CREATED', 'PAYMENT_WEBHOOK', 'PAYMENT_REFUND');

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wallet_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'UPI_QR',
    "razorpay_payment_id" TEXT,
    "razorpay_order_id" TEXT,
    "razorpay_payment_link_id" TEXT,
    "razorpay_qr_id" TEXT,
    "qr_image_url" TEXT,
    "qr_reference" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "webhook_verified" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_razorpay_payment_id_key" ON "payments"("razorpay_payment_id");
CREATE UNIQUE INDEX "payments_razorpay_order_id_key" ON "payments"("razorpay_order_id");
CREATE UNIQUE INDEX "payments_razorpay_payment_link_id_key" ON "payments"("razorpay_payment_link_id");
CREATE UNIQUE INDEX "payments_razorpay_qr_id_key" ON "payments"("razorpay_qr_id");
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");
CREATE INDEX "payments_wallet_id_idx" ON "payments"("wallet_id");
CREATE INDEX "payments_status_idx" ON "payments"("status");
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "payment_id" TEXT;
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "reference_number" TEXT;
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "payment_method" "PaymentMethod";
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;

CREATE UNIQUE INDEX "wallet_transactions_payment_id_key" ON "wallet_transactions"("payment_id");
CREATE UNIQUE INDEX "wallet_transactions_reference_number_key" ON "wallet_transactions"("reference_number");

ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payment_webhook_logs" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT,
    "razorpay_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "signature_valid" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "process_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_webhook_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_logs_razorpay_event_id_key" ON "payment_webhook_logs"("razorpay_event_id");
CREATE INDEX "payment_webhook_logs_payment_id_idx" ON "payment_webhook_logs"("payment_id");
ALTER TABLE "payment_webhook_logs" ADD CONSTRAINT "payment_webhook_logs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "financial_audit_logs" (
    "id" TEXT NOT NULL,
    "action" "FinancialAuditAction" NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "wallet_id" TEXT,
    "payment_id" TEXT,
    "transaction_id" TEXT,
    "amount" DECIMAL(14,2),
    "balance_before" DECIMAL(14,2),
    "balance_after" DECIMAL(14,2),
    "remarks" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "financial_audit_logs_target_user_id_idx" ON "financial_audit_logs"("target_user_id");
CREATE INDEX "financial_audit_logs_actor_id_idx" ON "financial_audit_logs"("actor_id");
CREATE INDEX "financial_audit_logs_action_idx" ON "financial_audit_logs"("action");
CREATE INDEX "financial_audit_logs_created_at_idx" ON "financial_audit_logs"("created_at");

ALTER TABLE "financial_audit_logs" ADD CONSTRAINT "financial_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_audit_logs" ADD CONSTRAINT "financial_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "wallet_balance_snapshots" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_balance_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wallet_balance_snapshots_wallet_id_idx" ON "wallet_balance_snapshots"("wallet_id");
ALTER TABLE "wallet_balance_snapshots" ADD CONSTRAINT "wallet_balance_snapshots_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

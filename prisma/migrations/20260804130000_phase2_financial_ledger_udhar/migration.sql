-- Phase 2 financial ledger + Udhar (credit) system.
-- See docs/features/04-phase2-financial-ledger-udhar.md and phase2-financial-ledger-udhar-as-built.md.

-- Enums

CREATE TYPE "FinancialActorType" AS ENUM ('VENDOR', 'RETAIL_CUSTOMER');

CREATE TYPE "FinancialEventType" AS ENUM (
  'ORDER_PLACEMENT_DEBIT',
  'AMENDMENT_DEBIT',
  'AMENDMENT_CREDIT',
  'WALLET_TOPUP',
  'WALLET_ADMIN_CREDIT',
  'WALLET_ADMIN_DEBIT',
  'DELIVERY_CHARGE_DEBIT',
  'UDHAR_DRAW',
  'UDHAR_REPAYMENT'
);

CREATE TYPE "FinancialEventDirection" AS ENUM ('DEBIT', 'CREDIT');

CREATE TYPE "FinancialInstrument" AS ENUM ('WALLET', 'UDHAR');

CREATE TYPE "FinancialReferenceType" AS ENUM (
  'ORDER',
  'AMENDMENT',
  'DISPATCH_BATCH',
  'TOPUP',
  'DRAW',
  'REPAYMENT',
  'WALLET_ADJUSTMENT'
);

CREATE TYPE "CreditTransactionType" AS ENUM ('DRAW', 'REPAYMENT');

-- 2A: FinancialEvent — append-only ledger, actor_id is polymorphic (not a foreign key; see model doc comment).

CREATE TABLE "financial_events" (
  "id" TEXT NOT NULL,
  "actor_type" "FinancialActorType" NOT NULL,
  "actor_id" TEXT NOT NULL,
  "event_type" "FinancialEventType" NOT NULL,
  "amount" DECIMAL(14, 2) NOT NULL,
  "direction" "FinancialEventDirection" NOT NULL,
  "instrument" "FinancialInstrument" NOT NULL,
  "reference_type" "FinancialReferenceType" NOT NULL,
  "reference_id" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "financial_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "financial_events_actor_type_actor_id_created_at_idx" ON "financial_events"("actor_type", "actor_id", "created_at" DESC);
CREATE INDEX "financial_events_reference_type_reference_id_idx" ON "financial_events"("reference_type", "reference_id");
CREATE INDEX "financial_events_event_type_idx" ON "financial_events"("event_type");

ALTER TABLE "financial_events"
  ADD CONSTRAINT "financial_events_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2B: CreditAccount — one per actor; limit set explicitly by admin, no auto-create on first draw.

CREATE TABLE "credit_accounts" (
  "id" TEXT NOT NULL,
  "actor_type" "FinancialActorType" NOT NULL,
  "actor_id" TEXT NOT NULL,
  "credit_limit" DECIMAL(14, 2) NOT NULL,
  "outstanding_balance" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_accounts_actor_type_actor_id_key" ON "credit_accounts"("actor_type", "actor_id");

CREATE TABLE "credit_transactions" (
  "id" TEXT NOT NULL,
  "credit_account_id" TEXT NOT NULL,
  "type" "CreditTransactionType" NOT NULL,
  "amount" DECIMAL(14, 2) NOT NULL,
  "reference_type" "FinancialReferenceType",
  "reference_id" TEXT,
  "recorded_by_user_id" TEXT NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_transactions_credit_account_id_created_at_idx" ON "credit_transactions"("credit_account_id", "created_at" DESC);

ALTER TABLE "credit_transactions"
  ADD CONSTRAINT "credit_transactions_credit_account_id_fkey"
  FOREIGN KEY ("credit_account_id") REFERENCES "credit_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credit_transactions"
  ADD CONSTRAINT "credit_transactions_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

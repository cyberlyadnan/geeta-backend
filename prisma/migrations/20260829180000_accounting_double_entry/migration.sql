-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountSubType" AS ENUM ('CASH', 'BANK', 'PAYMENT_GATEWAY', 'ACCOUNTS_RECEIVABLE', 'CREDIT_RECEIVABLE', 'INVENTORY', 'PREPAID_EXPENSE', 'ADVANCE_TO_SUPPLIER', 'INPUT_TAX', 'FIXED_ASSET', 'ACCUMULATED_DEPRECIATION', 'OTHER_CURRENT_ASSET', 'ACCOUNTS_PAYABLE', 'CUSTOMER_WALLET_LIABILITY', 'CUSTOMER_ADVANCE', 'OUTPUT_TAX', 'TAX_PAYABLE', 'ACCRUED_LIABILITY', 'LOAN', 'OTHER_CURRENT_LIABILITY', 'OWNERS_CAPITAL', 'RETAINED_EARNINGS', 'DRAWINGS', 'SALES_REVENUE', 'SERVICE_REVENUE', 'OTHER_INCOME', 'SALES_RETURN', 'COST_OF_GOODS_SOLD', 'DIRECT_EXPENSE', 'OPERATING_EXPENSE', 'PAYROLL_EXPENSE', 'FINANCE_COST', 'DEPRECIATION', 'OTHER_EXPENSE');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('OPENING_BALANCE', 'WALLET_TOPUP', 'WALLET_ADJUSTMENT', 'ORDER_ADVANCE', 'UDHAR_DRAW', 'UDHAR_REPAYMENT', 'COUNTER_RECEIPT', 'SALES_INVOICE', 'ADVANCE_APPLICATION', 'CREDIT_NOTE', 'REFUND_PAYOUT', 'EXPENSE', 'PURCHASE_BILL', 'SUPPLIER_PAYMENT', 'BANK_TRANSACTION', 'GATEWAY_SETTLEMENT', 'MANUAL_JOURNAL', 'DEPRECIATION', 'PERIOD_CLOSE');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "GstSupplyType" AS ENUM ('INTRA_STATE', 'INTER_STATE', 'EXEMPT', 'NIL_RATED', 'NON_GST', 'EXPORT');

-- CreateEnum
CREATE TYPE "GstDocumentCategory" AS ENUM ('B2B', 'B2CL', 'B2CS', 'EXPORT', 'CREDIT_NOTE_B2B', 'CREDIT_NOTE_B2C');

-- CreateEnum
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "CashBankAccountType" AS ENUM ('CASH', 'BANK', 'PAYMENT_GATEWAY');

-- CreateEnum
CREATE TYPE "BankTransactionDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('PENDING', 'CLEARED', 'RECONCILED', 'VOID');

-- CreateEnum
CREATE TYPE "BankReconciliationStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpensePaymentMode" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'CREDIT');

-- CreateEnum
CREATE TYPE "PurchaseBillStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditNoteReason" AS ENUM ('ORDER_CANCELLATION', 'ORDER_AMENDMENT', 'QUALITY_ISSUE', 'RATE_DIFFERENCE', 'GOODS_RETURN', 'POST_SALE_DISCOUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundMode" AS ENUM ('WALLET', 'CASH', 'BANK_TRANSFER', 'UPI', 'CREDIT_ADJUSTMENT', 'ADJUST_AGAINST_FUTURE');

-- AlterEnum
ALTER TYPE "FinancialEventType" ADD VALUE 'REFUND_CREDIT';

-- AlterEnum
ALTER TYPE "FinancialReferenceType" ADD VALUE 'CREDIT_NOTE';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "cess_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "document_category" "GstDocumentCategory" NOT NULL DEFAULT 'B2CS',
ADD COLUMN     "igst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "place_of_supply" TEXT,
ADD COLUMN     "reverse_charge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "round_off" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "supply_type" "GstSupplyType" NOT NULL DEFAULT 'INTRA_STATE',
ADD COLUMN     "tax_detail_ready" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "product_offerings" ADD COLUMN     "gst_rate_percent" DECIMAL(5,2),
ADD COLUMN     "hsn_code" TEXT;

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "subType" "AccountSubType" NOT NULL,
    "normal_balance" "NormalBalance" NOT NULL,
    "parent_id" TEXT,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" TEXT NOT NULL,
    "fiscal_year_id" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "voucher_number" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "fiscal_period" INTEGER NOT NULL,
    "source_type" "JournalSourceType" NOT NULL,
    "source_id" TEXT,
    "source_key" TEXT NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED',
    "narration" TEXT NOT NULL,
    "party_type" "FinancialActorType",
    "party_id" TEXT,
    "party_name" TEXT,
    "total_debit" DECIMAL(14,2) NOT NULL,
    "total_credit" DECIMAL(14,2) NOT NULL,
    "reversal_of_id" TEXT,
    "reversal_reason" TEXT,
    "is_system_generated" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "account_id" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "party_type" "FinancialActorType",
    "party_id" TEXT,
    "supplier_id" TEXT,
    "department_id" TEXT,
    "hsn_code" TEXT,
    "tax_rate" DECIMAL(5,2),
    "taxable_value" DECIMAL(14,2),
    "reference_type" TEXT,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_number_sequences" (
    "key" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "voucher_number_sequences_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "cash_bank_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CashBankAccountType" NOT NULL,
    "ledger_account_id" TEXT NOT NULL,
    "bank_name" TEXT,
    "account_number" TEXT,
    "ifsc" TEXT,
    "branch" TEXT,
    "upi_id" TEXT,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "opening_balance_as_of" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default_cash" BOOLEAN NOT NULL DEFAULT false,
    "is_default_bank" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "direction" "BankTransactionDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "value_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "counterparty" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "statement_ref" TEXT,
    "status" "BankTransactionStatus" NOT NULL DEFAULT 'CLEARED',
    "reconciled_at" TIMESTAMP(3),
    "reconciled_by_id" TEXT,
    "reconciliation_id" TEXT,
    "journal_entry_id" TEXT,
    "created_by_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "statement_date" DATE NOT NULL,
    "statement_balance" DECIMAL(14,2) NOT NULL,
    "book_balance" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2) NOT NULL,
    "status" "BankReconciliationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ledger_account_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "input_credit_eligible" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "expense_number" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "payee_name" TEXT,
    "supplier_id" TEXT,
    "description" TEXT NOT NULL,
    "taxable_amount" DECIMAL(14,2) NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tds_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "input_credit_eligible" BOOLEAN NOT NULL DEFAULT true,
    "supplier_gstin" TEXT,
    "supplier_invoice_number" TEXT,
    "supplier_invoice_date" TIMESTAMP(3),
    "hsn_code" TEXT,
    "payment_mode" "ExpensePaymentMode" NOT NULL,
    "paid_from_account_id" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'APPROVED',
    "department_id" TEXT,
    "attachment_url" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "state_code" TEXT,
    "pincode" TEXT,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 0,
    "ledger_account_id" TEXT,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_bills" (
    "id" TEXT NOT NULL,
    "bill_number" TEXT NOT NULL,
    "supplier_bill_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "bill_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "place_of_supply" TEXT,
    "supply_type" "GstSupplyType" NOT NULL DEFAULT 'INTRA_STATE',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_value" DECIMAL(14,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "round_off" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "PurchaseBillStatus" NOT NULL DEFAULT 'APPROVED',
    "input_credit_eligible" BOOLEAN NOT NULL DEFAULT true,
    "reverse_charge" BOOLEAN NOT NULL DEFAULT false,
    "attachment_url" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_bill_items" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "hsn_code" TEXT,
    "material_id" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "uom" TEXT,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable_value" DECIMAL(14,2) NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "expense_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "payment_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" "ExpensePaymentMode" NOT NULL,
    "from_account_id" TEXT NOT NULL,
    "reference_number" TEXT,
    "tds_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_tax_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "hsn_code" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'NOS',
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "taxable_value" DECIMAL(14,2) NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cess_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_tax_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "credit_note_number" TEXT NOT NULL,
    "invoice_id" TEXT,
    "order_id" TEXT,
    "actor_type" "FinancialActorType" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "billed_to_name" TEXT NOT NULL,
    "gst_number" TEXT,
    "note_date" TIMESTAMP(3) NOT NULL,
    "reason" "CreditNoteReason" NOT NULL,
    "reason_note" TEXT,
    "place_of_supply" TEXT,
    "supply_type" "GstSupplyType" NOT NULL DEFAULT 'INTRA_STATE',
    "document_category" "GstDocumentCategory" NOT NULL DEFAULT 'CREDIT_NOTE_B2C',
    "taxable_value" DECIMAL(14,2) NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "refund_mode" "RefundMode" NOT NULL,
    "refunded_from_account_id" TEXT,
    "refunded_at" TIMESTAMP(3),
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "pdf_url" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gst_rate_masters" (
    "id" TEXT NOT NULL,
    "hsn_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rate_percent" DECIMAL(5,2) NOT NULL,
    "cess_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "is_service" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gst_rate_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "home_state_code" TEXT NOT NULL DEFAULT '24',
    "default_gst_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "default_hsn_code" TEXT NOT NULL DEFAULT '4911',
    "fiscal_year_start_month" INTEGER NOT NULL DEFAULT 4,
    "auto_posting_enabled" BOOLEAN NOT NULL DEFAULT true,
    "b2cl_threshold" DECIMAL(14,2) NOT NULL DEFAULT 250000,
    "books_begin_from" TIMESTAMP(3),
    "enable_tds" BOOLEAN NOT NULL DEFAULT false,
    "default_tds_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_projection_runs" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "entries_posted" INTEGER NOT NULL DEFAULT 0,
    "sources_scanned" JSONB NOT NULL DEFAULT '{}',
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" TEXT,

    CONSTRAINT "accounting_projection_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_code_key" ON "chart_of_accounts"("code");

-- CreateIndex
CREATE INDEX "chart_of_accounts_type_subType_idx" ON "chart_of_accounts"("type", "subType");

-- CreateIndex
CREATE INDEX "chart_of_accounts_parent_id_idx" ON "chart_of_accounts"("parent_id");

-- CreateIndex
CREATE INDEX "chart_of_accounts_is_active_idx" ON "chart_of_accounts"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_label_key" ON "fiscal_years"("label");

-- CreateIndex
CREATE INDEX "fiscal_years_is_current_idx" ON "fiscal_years"("is_current");

-- CreateIndex
CREATE INDEX "fiscal_periods_start_date_end_date_idx" ON "fiscal_periods"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "fiscal_periods_status_idx" ON "fiscal_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_fiscal_year_id_period_number_key" ON "fiscal_periods"("fiscal_year_id", "period_number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_voucher_number_key" ON "journal_entries"("voucher_number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversal_of_id_key" ON "journal_entries"("reversal_of_id");

-- CreateIndex
CREATE INDEX "journal_entries_entry_date_idx" ON "journal_entries"("entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_fiscal_year_fiscal_period_idx" ON "journal_entries"("fiscal_year", "fiscal_period");

-- CreateIndex
CREATE INDEX "journal_entries_source_type_source_id_idx" ON "journal_entries"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "journal_entries_party_type_party_id_entry_date_idx" ON "journal_entries"("party_type", "party_id", "entry_date" DESC);

-- CreateIndex
CREATE INDEX "journal_entries_status_idx" ON "journal_entries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_source_type_source_key_key" ON "journal_entries"("source_type", "source_key");

-- CreateIndex
CREATE INDEX "journal_lines_journal_entry_id_idx" ON "journal_lines"("journal_entry_id");

-- CreateIndex
CREATE INDEX "journal_lines_account_id_created_at_idx" ON "journal_lines"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "journal_lines_party_type_party_id_idx" ON "journal_lines"("party_type", "party_id");

-- CreateIndex
CREATE INDEX "journal_lines_supplier_id_idx" ON "journal_lines"("supplier_id");

-- CreateIndex
CREATE INDEX "journal_lines_department_id_idx" ON "journal_lines"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_bank_accounts_code_key" ON "cash_bank_accounts"("code");

-- CreateIndex
CREATE INDEX "cash_bank_accounts_type_is_active_idx" ON "cash_bank_accounts"("type", "is_active");

-- CreateIndex
CREATE INDEX "bank_transactions_account_id_value_date_idx" ON "bank_transactions"("account_id", "value_date" DESC);

-- CreateIndex
CREATE INDEX "bank_transactions_status_idx" ON "bank_transactions"("status");

-- CreateIndex
CREATE INDEX "bank_transactions_reference_type_reference_id_idx" ON "bank_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "bank_reconciliations_account_id_statement_date_idx" ON "bank_reconciliations"("account_id", "statement_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_code_key" ON "expense_categories"("code");

-- CreateIndex
CREATE INDEX "expense_categories_is_active_idx" ON "expense_categories"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_expense_number_key" ON "expenses"("expense_number");

-- CreateIndex
CREATE INDEX "expenses_expense_date_idx" ON "expenses"("expense_date" DESC);

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"("status");

-- CreateIndex
CREATE INDEX "expenses_supplier_id_idx" ON "expenses"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "suppliers_is_active_idx" ON "suppliers"("is_active");

-- CreateIndex
CREATE INDEX "suppliers_gstin_idx" ON "suppliers"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_bills_bill_number_key" ON "purchase_bills"("bill_number");

-- CreateIndex
CREATE INDEX "purchase_bills_supplier_id_bill_date_idx" ON "purchase_bills"("supplier_id", "bill_date" DESC);

-- CreateIndex
CREATE INDEX "purchase_bills_status_idx" ON "purchase_bills"("status");

-- CreateIndex
CREATE INDEX "purchase_bills_due_date_idx" ON "purchase_bills"("due_date");

-- CreateIndex
CREATE INDEX "purchase_bill_items_bill_id_idx" ON "purchase_bill_items"("bill_id");

-- CreateIndex
CREATE INDEX "purchase_bill_items_material_id_idx" ON "purchase_bill_items"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_payment_number_key" ON "supplier_payments"("payment_number");

-- CreateIndex
CREATE INDEX "supplier_payments_supplier_id_payment_date_idx" ON "supplier_payments"("supplier_id", "payment_date" DESC);

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_bill_id_idx" ON "supplier_payment_allocations"("bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payment_allocations_payment_id_bill_id_key" ON "supplier_payment_allocations"("payment_id", "bill_id");

-- CreateIndex
CREATE INDEX "invoice_tax_lines_invoice_id_idx" ON "invoice_tax_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_tax_lines_hsn_code_idx" ON "invoice_tax_lines"("hsn_code");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_credit_note_number_key" ON "credit_notes"("credit_note_number");

-- CreateIndex
CREATE INDEX "credit_notes_actor_type_actor_id_note_date_idx" ON "credit_notes"("actor_type", "actor_id", "note_date" DESC);

-- CreateIndex
CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes"("invoice_id");

-- CreateIndex
CREATE INDEX "credit_notes_status_idx" ON "credit_notes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "gst_rate_masters_hsn_code_key" ON "gst_rate_masters"("hsn_code");

-- CreateIndex
CREATE INDEX "accounting_projection_runs_started_at_idx" ON "accounting_projection_runs"("started_at" DESC);

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_accounts" ADD CONSTRAINT "cash_bank_accounts_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_reconciled_by_id_fkey" FOREIGN KEY ("reconciled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "bank_reconciliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_from_account_id_fkey" FOREIGN KEY ("paid_from_account_id") REFERENCES "cash_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "purchase_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "cash_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "purchase_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_tax_lines" ADD CONSTRAINT "invoice_tax_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


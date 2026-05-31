-- DropIndex
DROP INDEX "categories_is_active_idx";

-- CreateIndex
CREATE INDEX "configuration_option_pricing_option_id_idx" ON "configuration_option_pricing"("option_id");

-- CreateIndex
CREATE INDEX "payment_webhook_logs_created_at_idx" ON "payment_webhook_logs"("created_at");

-- CreateIndex
CREATE INDEX "product_offerings_sku_idx" ON "product_offerings"("sku");

-- CreateIndex
CREATE INDEX "product_series_product_code_idx" ON "product_series"("product_code");

-- CreateIndex
CREATE INDEX "wallet_balance_snapshots_created_at_idx" ON "wallet_balance_snapshots"("created_at");

-- RenameIndex
ALTER INDEX "product_offering_versions_product_offering_id_status_deleted_at" RENAME TO "product_offering_versions_product_offering_id_status_delete_idx";

-- RenameIndex
ALTER INDEX "product_offering_versions_product_offering_id_version_number_ke" RENAME TO "product_offering_versions_product_offering_id_version_numbe_key";

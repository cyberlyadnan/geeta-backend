-- Step 3 of the vendor order wizard is currently always skipped. This lets an admin opt a
-- specific product family into a step-3 template (e.g. a "pick a design" gallery) without any
-- further migration; "DEFAULT" preserves today's skip-to-step-4 behavior for every existing row.
ALTER TABLE "product_families" ADD COLUMN "step3_template_key" TEXT NOT NULL DEFAULT 'DEFAULT';

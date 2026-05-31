-- Product Engine Phase 2 — Configuration Engine

CREATE TYPE "ConfigurationFieldType" AS ENUM (
  'DROPDOWN',
  'RADIO',
  'CHECKBOX',
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'FILE'
);

CREATE TYPE "ConfigurationRuleType" AS ENUM (
  'SHOW',
  'HIDE',
  'REQUIRE',
  'DISABLE'
);

CREATE TABLE "configuration_groups" (
    "id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "configuration_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "configuration_fields" (
    "id" TEXT NOT NULL,
    "offering_id" TEXT NOT NULL,
    "group_id" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "field_type" "ConfigurationFieldType" NOT NULL,
    "placeholder" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "configuration_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "configuration_options" (
    "id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "configuration_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "configuration_rules" (
    "id" TEXT NOT NULL,
    "source_field_id" TEXT NOT NULL,
    "source_option_id" TEXT NOT NULL,
    "target_field_id" TEXT NOT NULL,
    "rule_type" "ConfigurationRuleType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "configuration_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuration_groups_offering_id_code_key"
    ON "configuration_groups"("offering_id", "code");
CREATE INDEX "configuration_groups_offering_id_idx"
    ON "configuration_groups"("offering_id");

CREATE UNIQUE INDEX "configuration_fields_offering_id_code_key"
    ON "configuration_fields"("offering_id", "code");
CREATE INDEX "configuration_fields_offering_id_idx"
    ON "configuration_fields"("offering_id");
CREATE INDEX "configuration_fields_group_id_idx"
    ON "configuration_fields"("group_id");

CREATE UNIQUE INDEX "configuration_options_field_id_value_key"
    ON "configuration_options"("field_id", "value");
CREATE INDEX "configuration_options_field_id_idx"
    ON "configuration_options"("field_id");

CREATE INDEX "configuration_rules_source_field_id_idx"
    ON "configuration_rules"("source_field_id");
CREATE INDEX "configuration_rules_source_option_id_idx"
    ON "configuration_rules"("source_option_id");
CREATE INDEX "configuration_rules_target_field_id_idx"
    ON "configuration_rules"("target_field_id");

ALTER TABLE "configuration_groups"
    ADD CONSTRAINT "configuration_groups_offering_id_fkey"
    FOREIGN KEY ("offering_id") REFERENCES "product_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "configuration_fields"
    ADD CONSTRAINT "configuration_fields_offering_id_fkey"
    FOREIGN KEY ("offering_id") REFERENCES "product_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "configuration_fields"
    ADD CONSTRAINT "configuration_fields_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "configuration_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "configuration_options"
    ADD CONSTRAINT "configuration_options_field_id_fkey"
    FOREIGN KEY ("field_id") REFERENCES "configuration_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "configuration_rules"
    ADD CONSTRAINT "configuration_rules_source_field_id_fkey"
    FOREIGN KEY ("source_field_id") REFERENCES "configuration_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "configuration_rules"
    ADD CONSTRAINT "configuration_rules_source_option_id_fkey"
    FOREIGN KEY ("source_option_id") REFERENCES "configuration_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "configuration_rules"
    ADD CONSTRAINT "configuration_rules_target_field_id_fkey"
    FOREIGN KEY ("target_field_id") REFERENCES "configuration_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

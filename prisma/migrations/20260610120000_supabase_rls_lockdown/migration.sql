-- Geeta Print — Row Level Security lockdown for Supabase PostgreSQL
-- Architecture: Express + Prisma ONLY (Supabase = managed Postgres, no Supabase Auth/Realtime/SDK)
--
-- Fixes Supabase Security Advisor:
--   • rls_disabled_in_public
--   • sensitive_columns_exposed
--
-- Run via: prisma migrate deploy  OR  paste into Supabase SQL Editor
--
-- IMPORTANT: Prisma connects as the `postgres` database role (superuser on Supabase).
-- Superusers bypass RLS — your Express backend continues to work unchanged.
-- RLS blocks Supabase PostgREST / anon / authenticated API access to raw tables.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enable RLS on every application table in public schema
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'roles', 'users', 'vendor_code_sequences', 'vendor_profiles',
    'vendor_compliance_requests', 'vendor_compliance_request_items', 'vendor_compliance_responses',
    'admin_notes', 'activity_logs', 'refresh_tokens',
    'categories', 'product_families', 'product_series', 'product_offerings', 'product_offering_versions',
    'configuration_groups', 'configuration_fields', 'configuration_options', 'configuration_rules',
    'quantity_pricing', 'configuration_option_pricing', 'pricing_rules', 'price_snapshots',
    'file_requirements', 'file_requirement_file_types', 'file_assets',
    'facilities', 'departments', 'workflow_templates', 'workflow_template_steps',
    'product_offering_workflows', 'machines', 'workflow_sla_policies',
    'production_orders', 'production_order_items', 'order_item_configurations', 'order_item_files',
    'workflow_instances', 'workflow_tasks', 'workflow_task_history', 'rework_requests', 'workflow_sla_breaches',
    'quotes', 'quote_items', 'production_job_cards',
    'material_categories', 'materials', 'bom_templates', 'bom_template_items',
    'audit_logs', 'orders', 'order_items',
    'wallets', 'wallet_transactions', 'payments', 'payment_webhook_logs',
    'financial_audit_logs', 'wallet_balance_snapshots',
    'contact_inquiries', 'contact_inquiry_notes', 'contact_inquiry_activities',
    'slider_slides'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
      RAISE NOTICE 'RLS enabled on public.%', tbl;
    ELSE
      RAISE NOTICE 'Skipped (not found): public.%', tbl;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Revoke direct table access from Supabase API roles
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl text;
  role_name text;
  tables text[] := ARRAY[
    'roles', 'users', 'vendor_code_sequences', 'vendor_profiles',
    'vendor_compliance_requests', 'vendor_compliance_request_items', 'vendor_compliance_responses',
    'admin_notes', 'activity_logs', 'refresh_tokens',
    'categories', 'product_families', 'product_series', 'product_offerings', 'product_offering_versions',
    'configuration_groups', 'configuration_fields', 'configuration_options', 'configuration_rules',
    'quantity_pricing', 'configuration_option_pricing', 'pricing_rules', 'price_snapshots',
    'file_requirements', 'file_requirement_file_types', 'file_assets',
    'facilities', 'departments', 'workflow_templates', 'workflow_template_steps',
    'product_offering_workflows', 'machines', 'workflow_sla_policies',
    'production_orders', 'production_order_items', 'order_item_configurations', 'order_item_files',
    'workflow_instances', 'workflow_tasks', 'workflow_task_history', 'rework_requests', 'workflow_sla_breaches',
    'quotes', 'quote_items', 'production_job_cards',
    'material_categories', 'materials', 'bom_templates', 'bom_template_items',
    'audit_logs', 'orders', 'order_items',
    'wallets', 'wallet_transactions', 'payments', 'payment_webhook_logs',
    'financial_audit_logs', 'wallet_balance_snapshots',
    'contact_inquiries', 'contact_inquiry_notes', 'contact_inquiry_activities',
    'slider_slides'
  ];
  api_roles text[] := ARRAY['anon', 'authenticated'];
BEGIN
  FOREACH role_name IN ARRAY api_roles
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH tbl IN ARRAY tables
      LOOP
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
          EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, role_name);
        END IF;
      END LOOP;
      RAISE NOTICE 'Revoked table access from role %', role_name;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Explicit deny-all policies for Supabase JWT roles (defence in depth)
--    No permissive policies = zero rows via PostgREST for anon/authenticated
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl text;
  pol_name text;
  tables text[] := ARRAY[
    'roles', 'users', 'vendor_code_sequences', 'vendor_profiles',
    'vendor_compliance_requests', 'vendor_compliance_request_items', 'vendor_compliance_responses',
    'admin_notes', 'activity_logs', 'refresh_tokens',
    'categories', 'product_families', 'product_series', 'product_offerings', 'product_offering_versions',
    'configuration_groups', 'configuration_fields', 'configuration_options', 'configuration_rules',
    'quantity_pricing', 'configuration_option_pricing', 'pricing_rules', 'price_snapshots',
    'file_requirements', 'file_requirement_file_types', 'file_assets',
    'facilities', 'departments', 'workflow_templates', 'workflow_template_steps',
    'product_offering_workflows', 'machines', 'workflow_sla_policies',
    'production_orders', 'production_order_items', 'order_item_configurations', 'order_item_files',
    'workflow_instances', 'workflow_tasks', 'workflow_task_history', 'rework_requests', 'workflow_sla_breaches',
    'quotes', 'quote_items', 'production_job_cards',
    'material_categories', 'materials', 'bom_templates', 'bom_template_items',
    'audit_logs', 'orders', 'order_items',
    'wallets', 'wallet_transactions', 'payments', 'payment_webhook_logs',
    'financial_audit_logs', 'wallet_balance_snapshots',
    'contact_inquiries', 'contact_inquiry_notes', 'contact_inquiry_activities',
    'slider_slides'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      CONTINUE;
    END IF;

    pol_name := 'backend_only_deny_anon_' || tbl;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl AND policyname = pol_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)',
        pol_name, tbl
      );
    END IF;

    pol_name := 'backend_only_deny_authenticated_' || tbl;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl AND policyname = pol_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false)',
        pol_name, tbl
      );
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Revoke default PUBLIC grants on future tables (optional hardening)
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Prisma migrations table — keep RLS off (internal only, not exposed via API)
-- _prisma_migrations is intentionally excluded from the list above.

-- Geeta Print — Complete RLS lockdown (dynamic: all public tables)
-- Fixes Supabase Security Advisor: rls_disabled_in_public, sensitive_columns_exposed
-- Safe to re-run: idempotent policy creation

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

DO $$
DECLARE
  tbl text;
  role_name text;
  api_roles text[] := ARRAY['anon', 'authenticated', 'service_role'];
BEGIN
  FOREACH role_name IN ARRAY api_roles
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOR tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> '_prisma_migrations'
      LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, role_name);
      END LOOP;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  tbl text;
  pol_name text;
  api_roles text[] := ARRAY['anon', 'authenticated'];
  role_name text;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  LOOP
    FOREACH role_name IN ARRAY api_roles
    LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        CONTINUE;
      END IF;

      pol_name := 'backend_only_deny_' || role_name || '_' || tbl;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = tbl AND policyname = pol_name
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO %I USING (false) WITH CHECK (false)',
          pol_name, tbl, role_name
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;

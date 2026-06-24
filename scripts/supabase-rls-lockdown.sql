-- Geeta Print — Row Level Security lockdown for Supabase PostgreSQL
-- Architecture: Express + Prisma ONLY (Supabase = managed Postgres, no Supabase Auth/Realtime/SDK)
--
-- Fixes Supabase Security Advisor:
--   • rls_disabled_in_public
--   • sensitive_columns_exposed
--
-- Run via: npm run db:security-lockdown  OR  paste into Supabase SQL Editor
--
-- IMPORTANT: Prisma connects as the `postgres` database role (superuser on Supabase).
-- Superusers bypass RLS — your Express backend continues to work unchanged.
-- RLS blocks Supabase PostgREST / anon / authenticated API access to raw tables.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enable RLS on ALL public tables (except Prisma migrations metadata)
-- ─────────────────────────────────────────────────────────────────────────────

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
    RAISE NOTICE 'RLS enabled on public.%', tbl;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Revoke direct table access from Supabase API roles
-- ─────────────────────────────────────────────────────────────────────────────

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
      -- Re-grant service_role schema usage only (no table SELECT) — optional belt-and-suspenders
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Revoke default PUBLIC grants (defence in depth)
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Grant usage to postgres role only (Prisma connection)
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;

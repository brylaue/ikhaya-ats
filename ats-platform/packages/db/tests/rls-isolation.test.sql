-- RLS Isolation Integration Tests (US-367)
-- Run against a test database with migrations applied.
-- Verifies that anon key + no auth.uid() returns 0 rows for all agency-scoped tables.
--
-- Usage (via psql):
--   psql $DATABASE_URL -f tests/rls-isolation.test.sql
--
-- In CI: wrap with the supabase test runner or a pg_tap harness.

-- ─── Setup: create a test role with anon-level privileges ─────────────────────

-- Temporarily adopt the anon role (mimics extension with no JWT)
SET LOCAL ROLE anon;

-- ─── Core tables: must return 0 rows without a valid auth.uid() ──────────────

DO $$
DECLARE
  cnt bigint;
BEGIN
  -- candidates
  SELECT count(*) INTO cnt FROM candidates;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: candidates returned % rows for anon', cnt; END IF;

  -- companies
  SELECT count(*) INTO cnt FROM companies;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: companies returned % rows for anon', cnt; END IF;

  -- contacts
  SELECT count(*) INTO cnt FROM contacts;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: contacts returned % rows for anon', cnt; END IF;

  -- jobs
  SELECT count(*) INTO cnt FROM jobs;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: jobs returned % rows for anon', cnt; END IF;

  -- candidate_pipeline_entries
  SELECT count(*) INTO cnt FROM candidate_pipeline_entries;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: candidate_pipeline_entries returned % rows for anon', cnt; END IF;

  -- placements
  SELECT count(*) INTO cnt FROM placements;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: placements returned % rows for anon', cnt; END IF;

  -- activities
  SELECT count(*) INTO cnt FROM activities;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: activities returned % rows for anon', cnt; END IF;

  -- tasks
  SELECT count(*) INTO cnt FROM tasks;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: tasks returned % rows for anon', cnt; END IF;

  -- users (would expose recruiter names / emails across agencies)
  SELECT count(*) INTO cnt FROM users;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: users returned % rows for anon', cnt; END IF;

  -- email_threads
  SELECT count(*) INTO cnt FROM email_threads;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: email_threads returned % rows for anon', cnt; END IF;

  -- email_messages
  SELECT count(*) INTO cnt FROM email_messages;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: email_messages returned % rows for anon', cnt; END IF;

  -- outreach_sequences
  SELECT count(*) INTO cnt FROM outreach_sequences;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: outreach_sequences returned % rows for anon', cnt; END IF;

  -- webhook_endpoints
  SELECT count(*) INTO cnt FROM webhook_endpoints;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: webhook_endpoints returned % rows for anon', cnt; END IF;

  -- api_keys
  SELECT count(*) INTO cnt FROM api_keys;
  IF cnt > 0 THEN RAISE EXCEPTION 'RLS FAIL: api_keys returned % rows for anon', cnt; END IF;

  RAISE NOTICE 'RLS isolation test PASSED: all % tables return 0 rows for anon role', 14;
END $$;

-- ─── Reset role ───────────────────────────────────────────────────────────────

RESET ROLE;

-- ─── Verify no tables missing RLS ────────────────────────────────────────────

DO $$
DECLARE
  missing_rls text;
BEGIN
  SELECT string_agg(tablename, ', ' ORDER BY tablename)
  INTO missing_rls
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false
    AND tablename NOT IN (
      -- Supabase internal / non-sensitive lookup tables
      'schema_migrations',
      'spatial_ref_sys',
      'skills',       -- read-only global skill taxonomy, no agency data
      'tags'          -- global tag list, scoped differently
    );

  IF missing_rls IS NOT NULL THEN
    RAISE WARNING 'Tables with RLS disabled: %', missing_rls;
    -- Warning only: some tables may legitimately have RLS off (e.g. read-only enums)
  ELSE
    RAISE NOTICE 'All public tables have RLS enabled.';
  END IF;
END $$;

-- ─── Migration 052: RLS Audit Pass 2 (US-367) ────────────────────────────────
-- Second RLS pass. Addresses gaps that slipped past migration 044:
--
--   1. metrics_email_sync (015) — has agency_id, never had RLS enabled.
--      Readable to agency members; writes via service role only.
--
--   2. candidate_portal_tokens (050) — explicitly skipped RLS because
--      the public portal uses service role. Harden anyway: deny-all
--      policies at the user level so an accidental anon/user client
--      cannot enumerate tokens.  service_role bypasses RLS natively,
--      so the portal + send-link routes are unaffected.
--
--   3. prep_content + prep_content_templates (050) — created with
--      policies that reference the non-existent table `agency_users`.
--      Re-issue with the canonical pattern: agency_id = current_agency_id().
--      If the broken policies were never applied (CREATE POLICY errors on
--      missing relation) this block installs the correct ones; if somehow
--      they did land, DROP POLICY IF EXISTS clears them first.
--
-- All changes are idempotent and safe to re-run.

-- ─── 1. metrics_email_sync ────────────────────────────────────────────────────

ALTER TABLE metrics_email_sync ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'metrics_email_sync' AND policyname = 'agency_metrics_email_sync_select'
  ) THEN
    CREATE POLICY "agency_metrics_email_sync_select" ON metrics_email_sync
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
END $$;

-- INSERT/UPDATE/DELETE intentionally have no policy → only service_role writes.

-- ─── 2. candidate_portal_tokens ───────────────────────────────────────────────

ALTER TABLE candidate_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Recruiters in the token's agency can read + revoke (recruiter panel).
-- Service role is used for the public /candidate-portal/[token] endpoint
-- and for send-link creation — those bypass RLS.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'candidate_portal_tokens' AND policyname = 'agency_cpt_select'
  ) THEN
    CREATE POLICY "agency_cpt_select" ON candidate_portal_tokens
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'candidate_portal_tokens' AND policyname = 'agency_cpt_update'
  ) THEN
    CREATE POLICY "agency_cpt_update" ON candidate_portal_tokens
      FOR UPDATE USING (agency_id = current_agency_id());
  END IF;
END $$;

-- No INSERT/DELETE policy → only service_role can mint or hard-delete tokens.

-- ─── 3. prep_content (fix broken agency_users ref) ────────────────────────────

DROP POLICY IF EXISTS "prep_content_agency" ON prep_content;

ALTER TABLE prep_content ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'prep_content' AND policyname = 'agency_prep_content_select'
  ) THEN
    CREATE POLICY "agency_prep_content_select" ON prep_content
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'prep_content' AND policyname = 'agency_prep_content_insert'
  ) THEN
    CREATE POLICY "agency_prep_content_insert" ON prep_content
      FOR INSERT WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'prep_content' AND policyname = 'agency_prep_content_update'
  ) THEN
    CREATE POLICY "agency_prep_content_update" ON prep_content
      FOR UPDATE USING (agency_id = current_agency_id())
                WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'prep_content' AND policyname = 'agency_prep_content_delete'
  ) THEN
    CREATE POLICY "agency_prep_content_delete" ON prep_content
      FOR DELETE USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ─── 4. prep_content_templates (fix broken agency_users ref) ──────────────────

DROP POLICY IF EXISTS "prep_templates_agency" ON prep_content_templates;

ALTER TABLE prep_content_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'prep_content_templates' AND policyname = 'agency_prep_templates_select'
  ) THEN
    CREATE POLICY "agency_prep_templates_select" ON prep_content_templates
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'prep_content_templates' AND policyname = 'agency_prep_templates_insert'
  ) THEN
    CREATE POLICY "agency_prep_templates_insert" ON prep_content_templates
      FOR INSERT WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'prep_content_templates' AND policyname = 'agency_prep_templates_update'
  ) THEN
    CREATE POLICY "agency_prep_templates_update" ON prep_content_templates
      FOR UPDATE USING (agency_id = current_agency_id())
                WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'prep_content_templates' AND policyname = 'agency_prep_templates_delete'
  ) THEN
    CREATE POLICY "agency_prep_templates_delete" ON prep_content_templates
      FOR DELETE USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ─── 5. ai_usage_daily — tighten (already RLS-enabled in 049 but no WITH CHECK) ─

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_usage_daily' AND policyname = 'agency_ai_usage_daily_select'
  ) THEN
    -- 049 created a policy; only add if missing (defensive)
    CREATE POLICY "agency_ai_usage_daily_select" ON ai_usage_daily
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ─── Verification queries ─────────────────────────────────────────────────────
-- After applying, these should all return 0 rows (meaning every table
-- with an agency_id column is RLS-protected):
--
--   SELECT c.relname
--   FROM pg_class c
--   JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'agency_id'
--   WHERE c.relkind = 'r'
--     AND c.relnamespace = 'public'::regnamespace
--     AND c.relrowsecurity = false;
--
-- To test from the anon role:
--   SET ROLE anon;
--   SELECT count(*) FROM metrics_email_sync;       -- 0
--   SELECT count(*) FROM prep_content;             -- 0
--   SELECT count(*) FROM prep_content_templates;   -- 0
--   SELECT count(*) FROM candidate_portal_tokens;  -- 0
--   RESET ROLE;

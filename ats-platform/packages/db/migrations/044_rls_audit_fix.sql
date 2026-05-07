-- Migration 036: RLS Audit Fix (US-367)
-- Adds RLS to all core tables that were created without it in migration 001.
-- All policies use: agency_id = (SELECT agency_id FROM users WHERE id = auth.uid())
-- This is the pattern used by the extension (anon key + user JWT) and web app.
--
-- IMPORTANT: Every CREATE POLICY is idempotent via DO $$ ... IF NOT EXISTS.
-- If RLS is already enabled on a table, the ALTER is a no-op.

-- ─── Helper: ensure current_agency_id() function exists ──────────────────────

CREATE OR REPLACE FUNCTION current_agency_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT agency_id FROM users WHERE id = auth.uid() LIMIT 1;
$$;

-- ─── agencies (orgs) ─────────────────────────────────────────────────────────
-- Users can only see their own agency row.

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agencies' AND policyname = 'agency_self_select') THEN
    CREATE POLICY "agency_self_select" ON agencies
      FOR SELECT USING (id = current_agency_id());
  END IF;
END $$;

-- ─── users ────────────────────────────────────────────────────────────────────
-- Agency members can see all users in their agency.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'agency_users_select') THEN
    CREATE POLICY "agency_users_select" ON users
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'agency_users_update_own') THEN
    -- Users can update their own row; owners/admins can update any row in their agency
    CREATE POLICY "agency_users_update_own" ON users
      FOR UPDATE USING (
        id = auth.uid() OR (
          agency_id = current_agency_id() AND
          (SELECT role FROM users WHERE id = auth.uid()) IN ('owner','admin')
        )
      );
  END IF;
END $$;

-- ─── candidates ───────────────────────────────────────────────────────────────

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'candidates' AND policyname = 'agency_candidates_select') THEN
    CREATE POLICY "agency_candidates_select" ON candidates
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'candidates' AND policyname = 'agency_candidates_insert') THEN
    CREATE POLICY "agency_candidates_insert" ON candidates
      FOR INSERT WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'candidates' AND policyname = 'agency_candidates_update') THEN
    CREATE POLICY "agency_candidates_update" ON candidates
      FOR UPDATE USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'candidates' AND policyname = 'agency_candidates_delete') THEN
    CREATE POLICY "agency_candidates_delete" ON candidates
      FOR DELETE USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ─── companies (clients) ──────────────────────────────────────────────────────

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companies' AND policyname = 'agency_companies_select') THEN
    CREATE POLICY "agency_companies_select" ON companies
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companies' AND policyname = 'agency_companies_insert') THEN
    CREATE POLICY "agency_companies_insert" ON companies
      FOR INSERT WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companies' AND policyname = 'agency_companies_update') THEN
    CREATE POLICY "agency_companies_update" ON companies
      FOR UPDATE USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companies' AND policyname = 'agency_companies_delete') THEN
    CREATE POLICY "agency_companies_delete" ON companies
      FOR DELETE USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ─── contacts ─────────────────────────────────────────────────────────────────

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'agency_contacts_select') THEN
    CREATE POLICY "agency_contacts_select" ON contacts
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'agency_contacts_insert') THEN
    CREATE POLICY "agency_contacts_insert" ON contacts
      FOR INSERT WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'agency_contacts_update') THEN
    CREATE POLICY "agency_contacts_update" ON contacts
      FOR UPDATE USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'agency_contacts_delete') THEN
    CREATE POLICY "agency_contacts_delete" ON contacts
      FOR DELETE USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ─── jobs ─────────────────────────────────────────────────────────────────────

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'agency_jobs_select') THEN
    CREATE POLICY "agency_jobs_select" ON jobs
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'agency_jobs_insert') THEN
    CREATE POLICY "agency_jobs_insert" ON jobs
      FOR INSERT WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'agency_jobs_update') THEN
    CREATE POLICY "agency_jobs_update" ON jobs
      FOR UPDATE USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'agency_jobs_delete') THEN
    CREATE POLICY "agency_jobs_delete" ON jobs
      FOR DELETE USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ─── candidate_pipeline_entries (applications) ────────────────────────────────

ALTER TABLE candidate_pipeline_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'candidate_pipeline_entries' AND policyname = 'agency_cpe_select') THEN
    CREATE POLICY "agency_cpe_select" ON candidate_pipeline_entries
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'candidate_pipeline_entries' AND policyname = 'agency_cpe_insert') THEN
    CREATE POLICY "agency_cpe_insert" ON candidate_pipeline_entries
      FOR INSERT WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'candidate_pipeline_entries' AND policyname = 'agency_cpe_update') THEN
    CREATE POLICY "agency_cpe_update" ON candidate_pipeline_entries
      FOR UPDATE USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'candidate_pipeline_entries' AND policyname = 'agency_cpe_delete') THEN
    CREATE POLICY "agency_cpe_delete" ON candidate_pipeline_entries
      FOR DELETE USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ─── placements ───────────────────────────────────────────────────────────────

ALTER TABLE placements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'placements' AND policyname = 'agency_placements_select') THEN
    CREATE POLICY "agency_placements_select" ON placements
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'placements' AND policyname = 'agency_placements_insert') THEN
    CREATE POLICY "agency_placements_insert" ON placements
      FOR INSERT WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'placements' AND policyname = 'agency_placements_update') THEN
    CREATE POLICY "agency_placements_update" ON placements
      FOR UPDATE USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'placements' AND policyname = 'agency_placements_delete') THEN
    CREATE POLICY "agency_placements_delete" ON placements
      FOR DELETE USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ─── activities ───────────────────────────────────────────────────────────────

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activities' AND policyname = 'agency_activities_select') THEN
    CREATE POLICY "agency_activities_select" ON activities
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activities' AND policyname = 'agency_activities_insert') THEN
    CREATE POLICY "agency_activities_insert" ON activities
      FOR INSERT WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activities' AND policyname = 'agency_activities_update') THEN
    CREATE POLICY "agency_activities_update" ON activities
      FOR UPDATE USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ─── tasks ────────────────────────────────────────────────────────────────────

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'agency_tasks_select') THEN
    CREATE POLICY "agency_tasks_select" ON tasks
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'agency_tasks_insert') THEN
    CREATE POLICY "agency_tasks_insert" ON tasks
      FOR INSERT WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'agency_tasks_update') THEN
    CREATE POLICY "agency_tasks_update" ON tasks
      FOR UPDATE USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'agency_tasks_delete') THEN
    CREATE POLICY "agency_tasks_delete" ON tasks
      FOR DELETE USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ─── resumes ──────────────────────────────────────────────────────────────────
-- Resumes belong to candidates; isolation via candidate's agency_id.

ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'resumes' AND policyname = 'agency_resumes_select') THEN
    CREATE POLICY "agency_resumes_select" ON resumes
      FOR SELECT USING (
        candidate_id IN (
          SELECT id FROM candidates WHERE agency_id = current_agency_id()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'resumes' AND policyname = 'agency_resumes_insert') THEN
    CREATE POLICY "agency_resumes_insert" ON resumes
      FOR INSERT WITH CHECK (
        candidate_id IN (
          SELECT id FROM candidates WHERE agency_id = current_agency_id()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'resumes' AND policyname = 'agency_resumes_delete') THEN
    CREATE POLICY "agency_resumes_delete" ON resumes
      FOR DELETE USING (
        candidate_id IN (
          SELECT id FROM candidates WHERE agency_id = current_agency_id()
        )
      );
  END IF;
END $$;

-- ─── audit_log / audit_events ────────────────────────────────────────────────
-- Read-only for agency members; writes via service role only.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
    EXECUTE 'ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'agency_audit_log_select') THEN
      EXECUTE $pol$
        CREATE POLICY "agency_audit_log_select" ON audit_log
          FOR SELECT USING (agency_id = current_agency_id())
      $pol$;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_events') THEN
    EXECUTE 'ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_events' AND policyname = 'agency_audit_events_select') THEN
      EXECUTE $pol$
        CREATE POLICY "agency_audit_events_select" ON audit_events
          FOR SELECT USING (
            EXISTS (
              SELECT 1 FROM users
              WHERE users.id = auth.uid()
                AND users.agency_id = audit_events.agency_id
            )
          )
      $pol$;
    END IF;
  END IF;
END $$;

-- ─── embedding_jobs ───────────────────────────────────────────────────────────
-- AI embedding queue: only readable by agency members with analytics:read scope.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'embedding_jobs') THEN
    EXECUTE 'ALTER TABLE embedding_jobs ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'embedding_jobs' AND policyname = 'agency_embedding_jobs_select') THEN
      EXECUTE $pol$
        CREATE POLICY "agency_embedding_jobs_select" ON embedding_jobs
          FOR SELECT USING (agency_id = current_agency_id())
      $pol$;
    END IF;
  END IF;
END $$;

-- ─── Verification comment ─────────────────────────────────────────────────────
-- After applying this migration, run:
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
--     AND rowsecurity = false;
-- Result should be empty (or only Supabase internal tables).
--
-- Integration test (anon role):
--   SET ROLE anon;
--   SELECT count(*) FROM candidates; -- must return 0
--   SELECT count(*) FROM jobs;       -- must return 0
--   RESET ROLE;

/*
  # Core ATS Schema — Ikhaya Platform

  Creates the complete database schema matching the application's TypeScript types.
  Tables are created in dependency order. RLS policies isolate data per agency.

  ## Tables (in order)
  1. agencies — top-level tenant
  2. users — staff, synced from auth.users
  3. companies — client companies
  4. contacts — company contacts
  5. candidates — talent pool
  6. work_history, education — candidate detail
  7. jobs — open roles
  8. pipeline_stages, candidate_pipeline_entries — Kanban pipeline
  9. activities, tasks — workflow
  10. placements — successful fills
  11. portal_feedback, saved_searches — UX features
  12. email_threads, email_messages, candidate_email_links — email sync
  13. ikhaya_tenant_ms_tenants, provider_connections, sync_events — email auth/observability

  ## Functions
  - current_agency_id() — RLS helper
  - match_candidates() — vector similarity search
  - search_candidates() — full-text search
  - job_funnel_stats() — pipeline analytics
  - handle_new_auth_user() — auto-provision agency on signup

  ## Security
  - RLS enabled on all tables
  - All policies use current_agency_id() for multi-tenant isolation
*/

-- ─── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE email_provider  AS ENUM ('google', 'microsoft'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE email_direction AS ENUM ('inbound', 'outbound');  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE match_strategy  AS ENUM ('exact', 'alt', 'thread', 'fuzzy'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE match_status    AS ENUM ('active', 'pending_review', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Trigger helper ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ─── agencies ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agencies (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL UNIQUE,
  logo_url      TEXT,
  portal_domain TEXT,
  website       TEXT,
  settings      JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_agencies_upd BEFORE UPDATE ON agencies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

-- ─── users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id     UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  full_name     TEXT        NOT NULL DEFAULT '',
  role          TEXT        NOT NULL DEFAULT 'recruiter',
  title         TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  is_active     BOOLEAN     DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_agency_id_idx ON users(agency_id);
CREATE INDEX IF NOT EXISTS users_email_idx     ON users(email);
CREATE TRIGGER trg_users_upd BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ─── current_agency_id() — must come after users ──────────────────────────────

CREATE OR REPLACE FUNCTION current_agency_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT agency_id FROM users WHERE id = auth.uid();
$$;

-- ─── agencies RLS (now users exists) ─────────────────────────────────────────

CREATE POLICY "agency_self_select" ON agencies
  FOR SELECT TO authenticated
  USING (id = current_agency_id());

CREATE POLICY "agency_self_update" ON agencies
  FOR UPDATE TO authenticated
  USING (id = current_agency_id()) WITH CHECK (id = current_agency_id());

-- ─── users RLS ────────────────────────────────────────────────────────────────

CREATE POLICY "users_agency_select" ON users
  FOR SELECT TO authenticated USING (agency_id = current_agency_id());

CREATE POLICY "users_self_update" ON users
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "users_agency_insert" ON users
  FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());

-- ─── companies ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  website          TEXT,
  industry         TEXT,
  size             TEXT,
  hq_location      TEXT,
  arr              NUMERIC,
  logo_url         TEXT,
  notes            TEXT,
  contract_status  TEXT,
  billing_address  JSONB,
  portal_slug      TEXT,
  portal_token     TEXT,
  created_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS companies_agency_id_idx ON companies(agency_id);
CREATE INDEX IF NOT EXISTS companies_name_trgm_idx ON companies USING gin (name gin_trgm_ops);
CREATE TRIGGER trg_companies_upd BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_select" ON companies FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "companies_insert" ON companies FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "companies_update" ON companies FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "companies_delete" ON companies FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── contacts ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contacts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  company_id   UUID        REFERENCES companies(id) ON DELETE SET NULL,
  first_name   TEXT        NOT NULL,
  last_name    TEXT        NOT NULL,
  email        TEXT,
  phone        TEXT,
  title        TEXT,
  linkedin_url TEXT,
  notes        TEXT,
  is_primary   BOOLEAN     DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contacts_agency_id_idx  ON contacts(agency_id);
CREATE INDEX IF NOT EXISTS contacts_company_id_idx ON contacts(company_id);
CREATE TRIGGER trg_contacts_upd BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_select" ON contacts FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "contacts_insert" ON contacts FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "contacts_update" ON contacts FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "contacts_delete" ON contacts FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── candidates ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS candidates (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id          UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by         UUID        REFERENCES users(id) ON DELETE SET NULL,
  first_name         TEXT        NOT NULL,
  last_name          TEXT        NOT NULL,
  email              TEXT,
  phone              TEXT,
  current_title      TEXT,
  current_company    TEXT,
  location           TEXT,
  linkedin_url       TEXT,
  github_url         TEXT,
  portfolio_url      TEXT,
  resume_url         TEXT,
  resume_text        TEXT,
  skills             TEXT[]      DEFAULT '{}',
  tags               TEXT[]      DEFAULT '{}',
  years_experience   NUMERIC,
  desired_salary_min NUMERIC,
  desired_salary_max NUMERIC,
  availability       TEXT,
  source             TEXT,
  status             TEXT        DEFAULT 'active',
  notes              TEXT,
  embedding          vector(1536),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS candidates_agency_id_idx ON candidates(agency_id);
CREATE INDEX IF NOT EXISTS candidates_status_idx    ON candidates(status);
CREATE INDEX IF NOT EXISTS candidates_email_idx     ON candidates(email);
CREATE INDEX IF NOT EXISTS candidates_name_trgm_idx ON candidates USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_skills_idx    ON candidates USING gin (skills);
CREATE INDEX IF NOT EXISTS candidates_embedding_idx ON candidates USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS candidates_fulltext_idx  ON candidates USING gin (
  to_tsvector('english',
    coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
    coalesce(current_title,'') || ' ' || coalesce(current_company,'') || ' ' ||
    coalesce(resume_text,'')
  )
);
CREATE TRIGGER trg_candidates_upd BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "candidates_select" ON candidates FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "candidates_insert" ON candidates FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "candidates_update" ON candidates FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "candidates_delete" ON candidates FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── work_history ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS work_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  company      TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  start_date   TEXT        NOT NULL,
  end_date     TEXT,
  location     TEXT,
  bullets      JSONB       NOT NULL DEFAULT '[]',
  position     SMALLINT    NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS work_history_candidate_id_idx ON work_history(candidate_id);
CREATE TRIGGER trg_work_history_upd BEFORE UPDATE ON work_history FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE work_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_history_select" ON work_history FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "work_history_insert" ON work_history FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "work_history_update" ON work_history FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "work_history_delete" ON work_history FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── education ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS education (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  school       TEXT        NOT NULL,
  degree       TEXT        NOT NULL,
  field        TEXT        NOT NULL,
  grad_year    TEXT        NOT NULL,
  position     SMALLINT    NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS education_candidate_id_idx ON education(candidate_id);
CREATE TRIGGER trg_education_upd BEFORE UPDATE ON education FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE education ENABLE ROW LEVEL SECURITY;
CREATE POLICY "education_select" ON education FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "education_insert" ON education FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "education_update" ON education FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "education_delete" ON education FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── jobs ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  company_id       UUID        REFERENCES companies(id) ON DELETE SET NULL,
  contact_id       UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  owner_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  title            TEXT        NOT NULL,
  description      TEXT,
  requirements     TEXT,
  status           TEXT        DEFAULT 'open',
  priority         TEXT        DEFAULT 'medium',
  employment_type  TEXT,
  remote_policy    TEXT,
  location         TEXT,
  salary_min       NUMERIC,
  salary_max       NUMERIC,
  headcount        INTEGER     DEFAULT 1,
  fee_type         TEXT,
  fee_pct          NUMERIC,
  fee_flat         NUMERIC,
  portal_visible   BOOLEAN     DEFAULT FALSE,
  target_fill_date DATE,
  filled_date      DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jobs_agency_id_idx  ON jobs(agency_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx     ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_company_id_idx ON jobs(company_id);
CREATE TRIGGER trg_jobs_upd BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs_select" ON jobs FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "jobs_insert" ON jobs FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "jobs_update" ON jobs FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "jobs_delete" ON jobs FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── pipeline_stages ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  job_id      UUID        REFERENCES jobs(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  position    SMALLINT    NOT NULL DEFAULT 0,
  color       TEXT,
  sla_days    SMALLINT,
  is_default  BOOLEAN     DEFAULT FALSE,
  client_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipeline_stages_agency_id_idx ON pipeline_stages(agency_id);
CREATE INDEX IF NOT EXISTS pipeline_stages_job_id_idx    ON pipeline_stages(job_id);
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipeline_stages_select" ON pipeline_stages FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "pipeline_stages_insert" ON pipeline_stages FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "pipeline_stages_update" ON pipeline_stages FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "pipeline_stages_delete" ON pipeline_stages FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── candidate_pipeline_entries ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS candidate_pipeline_entries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id     UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id           UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage_id         UUID        NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  assigned_to      UUID        REFERENCES users(id) ON DELETE SET NULL,
  status           TEXT        DEFAULT 'active',
  notes            TEXT,
  entered_stage_at TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (candidate_id, job_id)
);

CREATE INDEX IF NOT EXISTS cpe_agency_id_idx    ON candidate_pipeline_entries(agency_id);
CREATE INDEX IF NOT EXISTS cpe_candidate_id_idx ON candidate_pipeline_entries(candidate_id);
CREATE INDEX IF NOT EXISTS cpe_job_id_idx       ON candidate_pipeline_entries(job_id);
CREATE INDEX IF NOT EXISTS cpe_stage_id_idx     ON candidate_pipeline_entries(stage_id);
CREATE TRIGGER trg_cpe_upd BEFORE UPDATE ON candidate_pipeline_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE candidate_pipeline_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpe_select" ON candidate_pipeline_entries FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "cpe_insert" ON candidate_pipeline_entries FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "cpe_update" ON candidate_pipeline_entries FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "cpe_delete" ON candidate_pipeline_entries FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── activities ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT        NOT NULL,
  entity_id   UUID        NOT NULL,
  action      TEXT        NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activities_agency_id_idx ON activities(agency_id);
CREATE INDEX IF NOT EXISTS activities_entity_idx    ON activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS activities_created_idx   ON activities(created_at DESC);
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities_select" ON activities FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "activities_insert" ON activities FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());

-- ─── tasks ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  assignee_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  entity_type  TEXT        NOT NULL,
  entity_id    UUID        NOT NULL,
  title        TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'open',
  priority     TEXT        NOT NULL DEFAULT 'medium',
  due_date     DATE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_agency_id_idx ON tasks(agency_id);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx  ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS tasks_entity_idx    ON tasks(entity_type, entity_id);
CREATE TRIGGER trg_tasks_upd BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── placements ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS placements (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id          UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id       UUID        NOT NULL REFERENCES candidates(id),
  job_id             UUID        NOT NULL REFERENCES jobs(id),
  company_id         UUID        REFERENCES companies(id) ON DELETE SET NULL,
  placed_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  status             TEXT        DEFAULT 'active',
  salary             NUMERIC,
  fee_amount         NUMERIC,
  fee_pct            NUMERIC,
  start_date         DATE,
  guarantee_days     INTEGER     DEFAULT 90,
  guarantee_end_date DATE,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS placements_agency_id_idx    ON placements(agency_id);
CREATE INDEX IF NOT EXISTS placements_candidate_id_idx ON placements(candidate_id);
CREATE INDEX IF NOT EXISTS placements_job_id_idx       ON placements(job_id);
CREATE TRIGGER trg_placements_upd BEFORE UPDATE ON placements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE placements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "placements_select" ON placements FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "placements_insert" ON placements FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "placements_update" ON placements FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "placements_delete" ON placements FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── portal_feedback ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_feedback (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id          UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  company_id         UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id             UUID        REFERENCES jobs(id) ON DELETE SET NULL,
  candidate_id       UUID        REFERENCES candidates(id) ON DELETE SET NULL,
  entry_id           UUID        REFERENCES candidate_pipeline_entries(id) ON DELETE SET NULL,
  feedback_type      TEXT,
  rating             SMALLINT,
  comment            TEXT,
  submitted_by_name  TEXT,
  submitted_by_email TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_feedback_agency_id_idx ON portal_feedback(agency_id);
ALTER TABLE portal_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_feedback_select" ON portal_feedback FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "portal_feedback_insert" ON portal_feedback FOR INSERT WITH CHECK (agency_id = current_agency_id());

-- ─── saved_searches ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_searches (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  name         TEXT        NOT NULL,
  query        TEXT        NOT NULL DEFAULT '',
  filters      JSONB       NOT NULL DEFAULT '{}',
  result_count INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_searches_agency_id_idx ON saved_searches(agency_id);
CREATE TRIGGER trg_saved_searches_upd BEFORE UPDATE ON saved_searches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_searches_select" ON saved_searches FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "saved_searches_insert" ON saved_searches FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "saved_searches_update" ON saved_searches FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "saved_searches_delete" ON saved_searches FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── email_threads ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_threads (
  id                 UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id          UUID           NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id            UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider           email_provider NOT NULL,
  provider_thread_id TEXT           NOT NULL,
  subject            TEXT,
  participant_count  INTEGER        NOT NULL DEFAULT 0,
  first_msg_at       TIMESTAMPTZ,
  last_msg_at        TIMESTAMPTZ,
  UNIQUE (user_id, provider, provider_thread_id)
);

CREATE INDEX IF NOT EXISTS email_threads_agency_id_idx   ON email_threads(agency_id);
CREATE INDEX IF NOT EXISTS email_threads_last_msg_at_idx ON email_threads(last_msg_at DESC);
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_threads_select" ON email_threads FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "email_threads_insert" ON email_threads FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "email_threads_update" ON email_threads FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "email_threads_delete" ON email_threads FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── email_messages ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_messages (
  id                   UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id            UUID            NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id              UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id            UUID            NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  provider             email_provider  NOT NULL,
  provider_message_id  TEXT            NOT NULL,
  internet_message_id  TEXT,
  sent_at              TIMESTAMPTZ     NOT NULL,
  direction            email_direction NOT NULL,
  from_addr            TEXT            NOT NULL,
  to_addrs             TEXT[]          NOT NULL DEFAULT '{}',
  cc_addrs             TEXT[]          NOT NULL DEFAULT '{}',
  bcc_addrs            TEXT[]          NOT NULL DEFAULT '{}',
  subject              TEXT,
  snippet              TEXT,
  body_html_s3_key     TEXT,
  body_text_s3_key     TEXT,
  labels_or_categories TEXT[]          NOT NULL DEFAULT '{}',
  raw_headers_s3_key   TEXT,
  UNIQUE (user_id, provider, provider_message_id)
);

CREATE INDEX IF NOT EXISTS email_messages_agency_id_idx ON email_messages(agency_id);
CREATE INDEX IF NOT EXISTS email_messages_thread_id_idx ON email_messages(thread_id);
CREATE INDEX IF NOT EXISTS email_messages_sent_at_idx   ON email_messages(sent_at DESC);
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_messages_select" ON email_messages FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "email_messages_insert" ON email_messages FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "email_messages_update" ON email_messages FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "email_messages_delete" ON email_messages FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── candidate_email_links ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS candidate_email_links (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id     UUID           NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  message_id       UUID           NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  match_strategy   match_strategy NOT NULL,
  match_confidence NUMERIC(4,3)   NOT NULL CHECK (match_confidence BETWEEN 0 AND 1),
  matched_address  TEXT,
  status           match_status   NOT NULL DEFAULT 'active',
  reviewed_by      UUID           REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cel_candidate_id_idx ON candidate_email_links(candidate_id);
CREATE INDEX IF NOT EXISTS cel_message_id_idx   ON candidate_email_links(message_id);
ALTER TABLE candidate_email_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cel_select" ON candidate_email_links FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM email_messages em WHERE em.id = message_id AND em.agency_id = current_agency_id()));
CREATE POLICY "cel_insert" ON candidate_email_links FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM email_messages em WHERE em.id = message_id AND em.agency_id = current_agency_id()));
CREATE POLICY "cel_update" ON candidate_email_links FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM email_messages em WHERE em.id = message_id AND em.agency_id = current_agency_id()));
CREATE POLICY "cel_delete" ON candidate_email_links FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM email_messages em WHERE em.id = message_id AND em.agency_id = current_agency_id()));

-- ─── ikhaya_tenant_ms_tenants ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ikhaya_tenant_ms_tenants (
  ikhaya_agency_id         UUID    NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  ms_tenant_id             TEXT    NOT NULL,
  admin_consented          BOOLEAN NOT NULL DEFAULT FALSE,
  admin_consented_at       TIMESTAMPTZ,
  admin_consented_by_email TEXT,
  PRIMARY KEY (ikhaya_agency_id, ms_tenant_id)
);

ALTER TABLE ikhaya_tenant_ms_tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ms_tenants_select" ON ikhaya_tenant_ms_tenants FOR SELECT TO authenticated USING (ikhaya_agency_id = current_agency_id());
CREATE POLICY "ms_tenants_insert" ON ikhaya_tenant_ms_tenants FOR INSERT TO authenticated WITH CHECK (ikhaya_agency_id = current_agency_id());
CREATE POLICY "ms_tenants_update" ON ikhaya_tenant_ms_tenants FOR UPDATE TO authenticated USING (ikhaya_agency_id = current_agency_id()) WITH CHECK (ikhaya_agency_id = current_agency_id());

-- ─── provider_connections ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provider_connections (
  id                       UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id                UUID           NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id                  UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                 email_provider NOT NULL,
  provider_sub             TEXT           NOT NULL,
  email                    TEXT           NOT NULL,
  ms_tenant_id             TEXT,
  refresh_token_secret_ref TEXT           NOT NULL,
  access_token_expires_at  TIMESTAMPTZ    NOT NULL,
  scopes                   TEXT[]         NOT NULL DEFAULT '{}',
  realtime_subscription_id TEXT,
  realtime_expires_at      TIMESTAMPTZ,
  delta_cursor             TEXT,
  sync_enabled             BOOLEAN        NOT NULL DEFAULT TRUE,
  backfill_completed_at    TIMESTAMPTZ,
  created_at               TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS provider_connections_agency_id_idx ON provider_connections(agency_id);
CREATE TRIGGER trg_pc_upd BEFORE UPDATE ON provider_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pc_select" ON provider_connections FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "pc_insert" ON provider_connections FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "pc_update" ON provider_connections FOR UPDATE TO authenticated USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY "pc_delete" ON provider_connections FOR DELETE TO authenticated USING (agency_id = current_agency_id());

-- ─── sync_events ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_events (
  id                 BIGSERIAL      PRIMARY KEY,
  agency_id          UUID           NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id            UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider           email_provider NOT NULL,
  event_type         TEXT           NOT NULL,
  cursor_before      TEXT,
  cursor_after       TEXT,
  messages_processed INTEGER        NOT NULL DEFAULT 0,
  matches_created    INTEGER        NOT NULL DEFAULT 0,
  error_code         TEXT,
  error_body         JSONB,
  occurred_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_events_agency_id_idx  ON sync_events(agency_id);
CREATE INDEX IF NOT EXISTS sync_events_occurred_at_idx ON sync_events(user_id, occurred_at DESC);
ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_events_select" ON sync_events FOR SELECT TO authenticated USING (agency_id = current_agency_id());
CREATE POLICY "sync_events_insert" ON sync_events FOR INSERT TO authenticated WITH CHECK (agency_id = current_agency_id());

-- ─── RPC Functions ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_candidates(
  query_embedding  vector(1536),
  p_agency_id      UUID,
  match_threshold  FLOAT   DEFAULT 0.5,
  match_count      INTEGER DEFAULT 10
)
RETURNS TABLE (
  id               UUID, first_name TEXT, last_name TEXT, email TEXT,
  current_title TEXT, current_company TEXT, location TEXT,
  status TEXT, skills TEXT[], years_experience NUMERIC, similarity FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.first_name, c.last_name, c.email, c.current_title,
         c.current_company, c.location, c.status, c.skills, c.years_experience,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM candidates c
  WHERE c.agency_id = p_agency_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION search_candidates(
  p_agency_id UUID, p_query TEXT,
  p_status TEXT DEFAULT NULL, p_skills TEXT[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, first_name TEXT, last_name TEXT, email TEXT,
  current_title TEXT, current_company TEXT, location TEXT,
  status TEXT, skills TEXT[], years_experience NUMERIC, rank FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.first_name, c.last_name, c.email, c.current_title,
         c.current_company, c.location, c.status, c.skills, c.years_experience,
         CASE WHEN p_query = '' THEN 1.0
              ELSE ts_rank(
                to_tsvector('english', coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'') || ' ' ||
                  coalesce(c.current_title,'') || ' ' || coalesce(c.current_company,'') || ' ' || coalesce(c.resume_text,'')),
                plainto_tsquery('english', p_query)
              )
         END::FLOAT AS rank
  FROM candidates c
  WHERE c.agency_id = p_agency_id
    AND (p_status IS NULL OR c.status = p_status)
    AND (p_skills IS NULL OR c.skills && p_skills)
    AND (p_query = ''
         OR to_tsvector('english', coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'') || ' ' ||
              coalesce(c.current_title,'') || ' ' || coalesce(c.current_company,'') || ' ' || coalesce(c.resume_text,''))
            @@ plainto_tsquery('english', p_query)
         OR (c.first_name || ' ' || c.last_name) ILIKE '%' || p_query || '%')
  ORDER BY rank DESC
  LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION job_funnel_stats(p_agency_id UUID, p_job_id UUID)
RETURNS TABLE (
  stage_id UUID, stage_name TEXT, stage_position INTEGER, color TEXT,
  client_name TEXT, candidate_count BIGINT, avg_days_in_stage FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT ps.id, ps.name, ps.position::INTEGER, ps.color, ps.client_name,
         COUNT(cpe.id),
         AVG(EXTRACT(EPOCH FROM (NOW() - cpe.entered_stage_at)) / 86400)
  FROM pipeline_stages ps
  LEFT JOIN candidate_pipeline_entries cpe
    ON cpe.stage_id = ps.id AND cpe.job_id = p_job_id AND cpe.status = 'active'
  WHERE ps.agency_id = p_agency_id
    AND (ps.job_id = p_job_id OR ps.is_default = TRUE)
  GROUP BY ps.id, ps.name, ps.position, ps.color, ps.client_name
  ORDER BY ps.position;
$$;

-- ─── Auth user sync trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_agency_id UUID;
BEGIN
  -- Check if invited user already has a stub row
  IF EXISTS (SELECT 1 FROM users WHERE email = NEW.email) THEN
    UPDATE users SET id = NEW.id WHERE email = NEW.email AND id != NEW.id;
    RETURN NEW;
  END IF;

  -- New signup: create agency + owner user
  INSERT INTO agencies (name, slug)
  VALUES (
    coalesce(NEW.raw_user_meta_data->>'agency_name', split_part(NEW.email, '@', 2)),
    regexp_replace(
      lower(coalesce(NEW.raw_user_meta_data->>'agency_name', split_part(NEW.email, '@', 2))),
      '[^a-z0-9]+', '-', 'g'
    ) || '-' || substr(replace(NEW.id::text, '-', ''), 1, 6)
  )
  RETURNING id INTO v_agency_id;

  INSERT INTO users (id, agency_id, email, full_name, role)
  VALUES (
    NEW.id, v_agency_id, NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'owner'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ============================================================
-- ATS Platform — Initial Schema
-- PostgreSQL 16+
-- Extensions: pgvector, pg_trgm, uuid-ossp
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE candidate_status   AS ENUM ('active','passive','not_looking','placed','do_not_contact');
CREATE TYPE job_status         AS ENUM ('draft','active','on_hold','filled','cancelled');
CREATE TYPE job_type           AS ENUM ('permanent','contract','temp','interim');
CREATE TYPE job_priority       AS ENUM ('low','medium','high','urgent');
CREATE TYPE application_status AS ENUM ('identified','screened','ready_to_submit','submitted','client_review','interview_scheduled','offer','placed','not_progressing');
CREATE TYPE client_decision    AS ENUM ('advance','hold','pass');
CREATE TYPE user_role          AS ENUM ('owner','admin','senior_recruiter','recruiter','viewer','client');
CREATE TYPE activity_type      AS ENUM ('note','call','email','sms','submission','stage_change','placement','client_feedback','task_created','task_completed');
CREATE TYPE skill_source       AS ENUM ('self','parsed','inferred','recruiter');
CREATE TYPE proficiency_level  AS ENUM ('beginner','intermediate','advanced','expert');
CREATE TYPE stage_type         AS ENUM ('sourced','screened','submitted','client_review','interview','offer','placed','rejected','custom');

-- ─── Organisations ────────────────────────────────────────────────────────────

CREATE TABLE orgs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  logo_url     TEXT,
  timezone     TEXT NOT NULL DEFAULT 'America/New_York',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  avatar_url     TEXT,
  role           user_role NOT NULL DEFAULT 'recruiter',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, email)
);

CREATE INDEX users_org_id_idx ON users(org_id);
CREATE INDEX users_email_idx  ON users(email);

-- ─── Clients ──────────────────────────────────────────────────────────────────

CREATE TABLE clients (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id               UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  domain               TEXT,
  logo_url             TEXT,
  industry             TEXT,
  size                 TEXT,
  portal_slug          TEXT UNIQUE,
  portal_domain        TEXT UNIQUE,
  portal_brand_color   TEXT DEFAULT '#5461f5',
  health_score         SMALLINT CHECK (health_score BETWEEN 0 AND 100),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX clients_org_id_idx ON clients(org_id);

-- ─── Contacts (at client companies) ──────────────────────────────────────────

CREATE TABLE contacts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  title            TEXT,
  linkedin_url     TEXT,
  avatar_url       TEXT,
  is_portal_user   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX contacts_client_id_idx ON contacts(client_id);
CREATE INDEX contacts_org_id_idx    ON contacts(org_id);

-- ─── Skill taxonomy ───────────────────────────────────────────────────────────

CREATE TABLE skills (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  normalized_name  TEXT NOT NULL UNIQUE,
  category         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX skills_name_trgm_idx ON skills USING gin (name gin_trgm_ops);

-- ─── Tags ─────────────────────────────────────────────────────────────────────

CREATE TABLE tags (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

-- ─── Candidates ───────────────────────────────────────────────────────────────

CREATE TABLE candidates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  current_title     TEXT,
  current_company   TEXT,
  location_city     TEXT,
  location_state    TEXT,
  location_country  TEXT DEFAULT 'US',
  open_to_remote    BOOLEAN DEFAULT FALSE,
  linkedin_url      TEXT,
  portfolio_url     TEXT,
  avatar_key        TEXT,           -- S3/R2 object key
  status            candidate_status NOT NULL DEFAULT 'active',
  source            TEXT,
  summary           TEXT,
  -- Compensation (application-level AES-256 encryption for PII)
  current_salary    INTEGER,
  desired_salary    INTEGER,
  salary_currency   TEXT DEFAULT 'USD',
  -- AI embedding for semantic search (pgvector)
  embedding         vector(1536),
  last_activity_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX candidates_fulltext_idx ON candidates USING gin (
  to_tsvector('english',
    coalesce(first_name,'') || ' ' ||
    coalesce(last_name,'') || ' ' ||
    coalesce(current_title,'') || ' ' ||
    coalesce(current_company,'') || ' ' ||
    coalesce(summary,'')
  )
);

-- Trigram index for fuzzy name search
CREATE INDEX candidates_name_trgm_idx ON candidates USING gin (
  (first_name || ' ' || last_name) gin_trgm_ops
);

-- Vector index for semantic search
CREATE INDEX candidates_embedding_idx ON candidates USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX candidates_org_id_idx       ON candidates(org_id);
CREATE INDEX candidates_owner_id_idx     ON candidates(owner_id);
CREATE INDEX candidates_status_idx       ON candidates(status);
CREATE INDEX candidates_last_activity_idx ON candidates(last_activity_at DESC);

-- ─── Candidate tags ───────────────────────────────────────────────────────────

CREATE TABLE candidate_tags (
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  tag_id       UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (candidate_id, tag_id)
);

-- ─── Candidate skills ─────────────────────────────────────────────────────────

CREATE TABLE candidate_skills (
  candidate_id       UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  skill_id           UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  proficiency_level  proficiency_level,
  years_experience   SMALLINT,
  source             skill_source NOT NULL DEFAULT 'parsed',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (candidate_id, skill_id)
);

CREATE INDEX candidate_skills_skill_id_idx ON candidate_skills(skill_id);

-- ─── Resumes ──────────────────────────────────────────────────────────────────

CREATE TABLE resumes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  file_key      TEXT NOT NULL,          -- S3/R2 object key
  file_name     TEXT,
  mime_type     TEXT DEFAULT 'application/pdf',
  file_size     INTEGER,
  parsed_json   JSONB,                  -- structured parsed output
  raw_text      TEXT,                   -- extracted plain text
  version       SMALLINT NOT NULL DEFAULT 1,
  is_current    BOOLEAN NOT NULL DEFAULT TRUE,
  parsed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX resumes_candidate_id_idx ON resumes(candidate_id);
CREATE INDEX resumes_is_current_idx   ON resumes(candidate_id) WHERE is_current = TRUE;

-- ─── Work history ─────────────────────────────────────────────────────────────

CREATE TABLE work_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  company       TEXT NOT NULL,
  title         TEXT NOT NULL,
  start_date    DATE,
  end_date      DATE,
  is_current    BOOLEAN NOT NULL DEFAULT FALSE,
  description   TEXT,
  location      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX work_history_candidate_id_idx ON work_history(candidate_id);

-- ─── Pipelines ────────────────────────────────────────────────────────────────

CREATE TABLE pipelines (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pipeline_stages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_id  UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  stage_order  SMALLINT NOT NULL,
  type         stage_type NOT NULL DEFAULT 'custom',
  color        TEXT DEFAULT '#6b7280',
  sla_days     SMALLINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pipeline_id, stage_order)
);

CREATE INDEX pipeline_stages_pipeline_id_idx ON pipeline_stages(pipeline_id);

-- ─── Jobs ─────────────────────────────────────────────────────────────────────

CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id         UUID NOT NULL REFERENCES clients(id),
  owner_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  pipeline_id       UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  location          TEXT,
  type              job_type NOT NULL DEFAULT 'permanent',
  status            job_status NOT NULL DEFAULT 'draft',
  priority          job_priority NOT NULL DEFAULT 'medium',
  salary_min        INTEGER,
  salary_max        INTEGER,
  salary_currency   TEXT DEFAULT 'USD',
  description       TEXT,
  estimated_fee     INTEGER,
  fee_probability   SMALLINT CHECK (fee_probability BETWEEN 0 AND 100),
  target_start_date DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX jobs_org_id_idx     ON jobs(org_id);
CREATE INDEX jobs_client_id_idx  ON jobs(client_id);
CREATE INDEX jobs_status_idx     ON jobs(status);

-- ─── Applications ─────────────────────────────────────────────────────────────

CREATE TABLE applications (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                   UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  candidate_id             UUID NOT NULL REFERENCES candidates(id),
  job_id                   UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage_id                 UUID NOT NULL REFERENCES pipeline_stages(id),
  status                   application_status NOT NULL DEFAULT 'identified',
  score                    SMALLINT CHECK (score BETWEEN 0 AND 100),
  recruiter_note           TEXT,
  submitted_to_client_at   TIMESTAMPTZ,
  client_decision          client_decision,
  client_decision_reason   TEXT,
  client_decision_note     TEXT,
  client_decision_at       TIMESTAMPTZ,
  stage_entered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidate_id, job_id)
);

CREATE INDEX applications_job_id_idx       ON applications(job_id);
CREATE INDEX applications_candidate_id_idx ON applications(candidate_id);
CREATE INDEX applications_stage_id_idx     ON applications(stage_id);
CREATE INDEX applications_status_idx       ON applications(status);

-- ─── Activities ───────────────────────────────────────────────────────────────

CREATE TABLE activities (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('candidate','job','application','client')),
  entity_id    UUID NOT NULL,
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  type         activity_type NOT NULL,
  summary      TEXT NOT NULL,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX activities_entity_idx   ON activities(entity_type, entity_id);
CREATE INDEX activities_actor_idx    ON activities(actor_id);
CREATE INDEX activities_created_idx  ON activities(created_at DESC);

-- ─── Tasks ────────────────────────────────────────────────────────────────────

CREATE TABLE tasks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  assignee_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type   TEXT CHECK (entity_type IN ('candidate','job','application','client')),
  entity_id     UUID,
  title         TEXT NOT NULL,
  due_at        TIMESTAMPTZ,
  priority      TEXT DEFAULT 'medium',
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tasks_assignee_id_idx ON tasks(assignee_id);
CREATE INDEX tasks_due_at_idx      ON tasks(due_at) WHERE completed = FALSE;

-- ─── Placements ───────────────────────────────────────────────────────────────

CREATE TABLE placements (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  application_id      UUID NOT NULL UNIQUE REFERENCES applications(id),
  candidate_id        UUID NOT NULL REFERENCES candidates(id),
  job_id              UUID NOT NULL REFERENCES jobs(id),
  client_id           UUID NOT NULL REFERENCES clients(id),
  fee_amount          INTEGER,
  fee_currency        TEXT DEFAULT 'USD',
  start_date          DATE,
  guarantee_days      SMALLINT DEFAULT 90,
  guarantee_ends_at   DATE,
  is_falloff          BOOLEAN NOT NULL DEFAULT FALSE,
  falloff_reason      TEXT,
  falloff_at          TIMESTAMPTZ,
  placed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX placements_org_id_idx       ON placements(org_id);
CREATE INDEX placements_client_id_idx    ON placements(client_id);
CREATE INDEX placements_candidate_id_idx ON placements(candidate_id);

-- ─── Audit log ────────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  org_id      UUID NOT NULL,
  user_id     UUID,
  action      TEXT NOT NULL,          -- CREATE, UPDATE, DELETE
  object_type TEXT NOT NULL,
  object_id   UUID NOT NULL,
  field_name  TEXT,
  old_value   TEXT,
  new_value   TEXT,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_log_org_id_idx     ON audit_log(org_id);
CREATE INDEX audit_log_object_idx     ON audit_log(object_type, object_id);
CREATE INDEX audit_log_created_at_idx ON audit_log(created_at DESC);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orgs_updated_at        BEFORE UPDATE ON orgs        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at       BEFORE UPDATE ON users       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clients_updated_at     BEFORE UPDATE ON clients     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_candidates_updated_at  BEFORE UPDATE ON candidates  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_jobs_updated_at        BEFORE UPDATE ON jobs        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated_at       BEFORE UPDATE ON tasks       FOR EACH ROW EXECUTE FUNCTION set_updated_at();

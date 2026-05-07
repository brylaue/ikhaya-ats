-- ─── Migration 050: Candidate Portal ─────────────────────────────────────────
-- US-240: Candidate login & stage status view (token-based portal access)
-- US-242: Per-candidate stage prep content
-- US-243: Stage prep template library

-- ─── Candidate portal tokens ──────────────────────────────────────────────────

CREATE TABLE candidate_portal_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  revoked_at      TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cpt_token_idx        ON candidate_portal_tokens(token);
CREATE INDEX cpt_candidate_idx    ON candidate_portal_tokens(candidate_id);
CREATE INDEX cpt_agency_idx       ON candidate_portal_tokens(agency_id);

-- No RLS — accessed without Supabase auth (token IS the auth). Service role only.

-- ─── Prep content (per candidate + job) ──────────────────────────────────────

CREATE TABLE prep_content (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES jobs(id) ON DELETE CASCADE,
  -- null stage_name = visible at all stages; set = visible only when on that stage
  stage_name      TEXT,
  content_type    TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'link')),
  title           TEXT NOT NULL,
  body            TEXT,    -- markdown or plain text for content_type='text'
  url             TEXT,    -- for content_type='link'
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prep_content_candidate_job_idx ON prep_content(candidate_id, job_id);
CREATE INDEX prep_content_agency_idx        ON prep_content(agency_id);

ALTER TABLE prep_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prep_content_agency" ON prep_content
  FOR ALL USING (
    agency_id = (
      SELECT agency_id FROM agency_users
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- ─── Prep content templates (reusable per agency) ────────────────────────────

CREATE TABLE prep_content_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  stage_name      TEXT,    -- optional: associate with a named stage
  content_type    TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'link')),
  title           TEXT NOT NULL,
  body            TEXT,
  url             TEXT,
  is_global       BOOLEAN NOT NULL DEFAULT TRUE,  -- visible to all recruiters in agency
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX prep_templates_agency_idx ON prep_content_templates(agency_id);

ALTER TABLE prep_content_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prep_templates_agency" ON prep_content_templates
  FOR ALL USING (
    agency_id = (
      SELECT agency_id FROM agency_users
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- ─── Updated_at triggers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prep_content_updated_at') THEN
    CREATE TRIGGER prep_content_updated_at
      BEFORE UPDATE ON prep_content
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prep_templates_updated_at') THEN
    CREATE TRIGGER prep_templates_updated_at
      BEFORE UPDATE ON prep_content_templates
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

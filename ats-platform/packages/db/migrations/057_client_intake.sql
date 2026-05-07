-- ─── Migration 057: Client Intake Form ───────────────────────────────────────
-- US-476: Shareable intake form that clients (hiring managers) fill out
-- to request a new job requisition. Recruiters create intake tokens,
-- share the URL, then convert submissions into jobs.

CREATE TABLE IF NOT EXISTS intake_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  company_id      UUID        REFERENCES companies(id) ON DELETE SET NULL,

  -- Access token embedded in the shareable URL
  token           TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),

  -- Submission state
  status          TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'converted', 'archived')),
  submitted_at    TIMESTAMPTZ,
  converted_job_id UUID       REFERENCES jobs(id) ON DELETE SET NULL,

  -- Who sent the form link
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Optional pre-fill data set by recruiter when creating the link
  prefill         JSONB       DEFAULT '{}',

  -- Submitted form data (filled by client/hiring manager)
  submission      JSONB,

  -- Expiry (default 30 days)
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intake_requests_agency_idx   ON intake_requests (agency_id);
CREATE INDEX IF NOT EXISTS intake_requests_status_idx   ON intake_requests (status);
CREATE INDEX IF NOT EXISTS intake_requests_company_idx  ON intake_requests (company_id);
CREATE INDEX IF NOT EXISTS intake_requests_token_idx    ON intake_requests (token);

ALTER TABLE intake_requests ENABLE ROW LEVEL SECURITY;

-- Recruiters can manage their own agency's intake requests
CREATE POLICY "intake_requests_agency_own" ON intake_requests FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE TRIGGER intake_requests_updated_at
  BEFORE UPDATE ON intake_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE intake_requests IS
  'Shareable job requisition intake forms. A recruiter creates a link, '
  'a hiring manager submits role requirements, and the recruiter converts '
  'the submission into a job posting.';

COMMENT ON COLUMN intake_requests.token IS
  'Random 48-hex token embedded in the public /intake/[token] URL. '
  'No auth required to submit — valid for expires_at duration.';

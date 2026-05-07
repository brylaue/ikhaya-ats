-- ─── Migration 069: Candidate Engagement Features ────────────────────────────
-- US-017: Candidate Do-Not-Contact & Ghosting Log
-- US-026: Requisition Exclusivity Windows
-- US-054: Call / Meeting Activity Log (manual, extends activities table)
-- US-046: Client Portal Audit Trail
-- US-122: Candidate Longlist / Shortlist per Req
-- US-474: Candidate Portal Invite Flow (magic-link for stage-status portal)

-- ─── US-017: Candidate Contact Flags ─────────────────────────────────────────

CREATE TYPE candidate_contact_flag_type AS ENUM (
  'do_not_contact',
  'ghosted',
  'placed_elsewhere',
  'pause'
);

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS contact_flag           candidate_contact_flag_type,
  ADD COLUMN IF NOT EXISTS contact_flag_reason    TEXT,
  ADD COLUMN IF NOT EXISTS contact_flag_set_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_flag_set_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_contact_date       DATE;

CREATE INDEX IF NOT EXISTS candidates_contact_flag_idx ON candidates (contact_flag) WHERE contact_flag IS NOT NULL;

-- ─── US-026: Requisition Exclusivity Windows ──────────────────────────────────

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS exclusive              BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exclusive_start_date   DATE,
  ADD COLUMN IF NOT EXISTS exclusive_end_date     DATE,
  ADD COLUMN IF NOT EXISTS exclusive_reason       TEXT,
  ADD COLUMN IF NOT EXISTS exclusive_contract_ref TEXT;

CREATE INDEX IF NOT EXISTS jobs_exclusive_idx ON jobs (exclusive, exclusive_end_date) WHERE exclusive = TRUE;

-- ─── US-054: Enhanced activity metadata for manual call / meeting logs ────────
-- The activities table already exists with type IN ('call', 'email', ...).
-- We need to add 'meeting' to the activity_type enum and store rich metadata
-- in the existing JSONB metadata column. No structural change needed beyond
-- the new enum value.

DO $$ BEGIN
  ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'meeting';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Convenience index for fetching calls+meetings per entity quickly
CREATE INDEX IF NOT EXISTS activities_call_meeting_idx
  ON activities (entity_type, entity_id, created_at DESC)
  WHERE type IN ('call', 'meeting');

-- ─── US-046: Client Portal Audit Trail ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_audit_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Actor — may be an external contact (invite-based, no auth.users row)
  actor_type    TEXT        NOT NULL CHECK (actor_type IN ('recruiter', 'client_contact', 'system')),
  actor_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email   TEXT,

  event_type    TEXT        NOT NULL CHECK (event_type IN (
    'portal_login', 'portal_view', 'candidate_viewed',
    'feedback_submitted', 'feedback_updated',
    'shortlist_viewed', 'scorecard_submitted',
    'document_downloaded', 'invite_accepted'
  )),

  -- Optional links to related records
  candidate_id  UUID        REFERENCES candidates(id) ON DELETE SET NULL,
  job_id        UUID        REFERENCES jobs(id) ON DELETE SET NULL,
  application_id UUID       REFERENCES applications(id) ON DELETE SET NULL,

  metadata      JSONB       DEFAULT '{}',
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pae_agency_company_idx  ON portal_audit_events (agency_id, company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS pae_event_type_idx      ON portal_audit_events (event_type);
CREATE INDEX IF NOT EXISTS pae_candidate_idx       ON portal_audit_events (candidate_id) WHERE candidate_id IS NOT NULL;

ALTER TABLE portal_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_audit_agency_read" ON portal_audit_events FOR SELECT
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

-- System / portal routes insert via service role — no INSERT policy needed for RLS users

COMMENT ON TABLE portal_audit_events IS
  'Append-only log of all client portal interactions. '
  'Recruiters can read events for their agency; writes are service-role only.';

-- ─── US-122: Candidate Longlist / Shortlist per Req ──────────────────────────

CREATE TABLE IF NOT EXISTS job_longlists (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  job_id        UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id  UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

  list_type     TEXT        NOT NULL DEFAULT 'longlist'
    CHECK (list_type IN ('longlist', 'shortlist', 'calibration')),

  rank          SMALLINT,
  added_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  notes         TEXT,

  -- Track promotion from longlist → shortlist
  promoted_at   TIMESTAMPTZ,
  promoted_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Track promotion to actual submittal
  submitted_at  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (job_id, candidate_id, list_type)
);

CREATE INDEX IF NOT EXISTS jll_job_idx       ON job_longlists (job_id, list_type);
CREATE INDEX IF NOT EXISTS jll_candidate_idx ON job_longlists (candidate_id);
CREATE INDEX IF NOT EXISTS jll_agency_idx    ON job_longlists (agency_id);

ALTER TABLE job_longlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_longlists_agency_own" ON job_longlists FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE TRIGGER job_longlists_updated_at
  BEFORE UPDATE ON job_longlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE job_longlists IS
  'Private longlist / shortlist / calibration candidates per requisition. '
  'Candidates promoted to shortlist then to submittal (applications table).';

-- ─── US-474: Candidate Portal Invite Flow ─────────────────────────────────────
-- Distinct from client_portal_invites (059) — this invites CANDIDATES to their
-- personalised stage-status view at /portal/candidate/[token].

CREATE TABLE IF NOT EXISTS candidate_portal_invites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  application_id  UUID        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  candidate_id    UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id          UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Magic-link token
  token           TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Invited by
  invited_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Lifecycle
  accepted_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  last_viewed_at  TIMESTAMPTZ,
  view_count      INTEGER     NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One active invite per application (revoke old, create new)
  UNIQUE (application_id)
);

CREATE INDEX IF NOT EXISTS cpi_agency_idx    ON candidate_portal_invites (agency_id);
CREATE INDEX IF NOT EXISTS cpi2_token_idx    ON candidate_portal_invites (token);
CREATE INDEX IF NOT EXISTS cpi2_candidate_idx ON candidate_portal_invites (candidate_id);

ALTER TABLE candidate_portal_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidate_portal_invites_agency_own" ON candidate_portal_invites FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE TRIGGER candidate_portal_invites_updated_at
  BEFORE UPDATE ON candidate_portal_invites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE candidate_portal_invites IS
  'Magic-link invitations for candidates to view their application stage status. '
  'One active invite per application; previous invite is superseded on re-send.';

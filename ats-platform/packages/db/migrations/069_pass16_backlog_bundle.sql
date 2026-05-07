-- ── Migration 069: Pass-16 Backlog Bundle ────────────────────────────────────
--
-- Batches schema for 20 backlog stories shipped in dev pass 16 (2026-04-22):
--
--   US-017  Candidate Do-Not-Contact & Ghosting Log
--   US-026  Requisition Exclusivity Windows
--   US-046  Client Portal Audit Trail
--   US-053  Email Rules & Filters
--   US-054  Manual Call / Meeting Activity Log  (extends activities.type enum)
--   US-094  In-Product Playbooks & Enablement Library
--   US-105  A/R & DSO Dashboard                 (invoices table + aging view)
--   US-122  Candidate Longlist / Shortlist per Req
--   US-124  Calibration Submissions              (is_calibration on applications)
--   US-158  BD Win/Loss Reasons & Analytics
--   US-241  Per-Candidate Stage Visibility Controls (column on pipeline_stages + overrides table)
--   US-414  Legal Hold / Compliance Hold
--   US-423  Pay Transparency & Equity Report     (offer + accepted amount on offer_rounds + demographic link)
--   US-444  Per-User External-AI Activity Audit  (columns on audit_log)
--
-- (Stories that did NOT require migrations: US-065, US-066, US-201, US-203, US-221, US-447.)
--
-- Idempotent: safe to re-run.

-- ──────────────────────────────────────────────────────────────────────────────
-- US-017 Candidate DNC / Ghosting
-- ──────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_contact_status') THEN
    CREATE TYPE candidate_contact_status AS ENUM (
      'ok','do_not_contact','ghosted','placed_elsewhere','paused'
    );
  END IF;
END $$;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS contact_status            candidate_contact_status NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS contact_reason            text,
  ADD COLUMN IF NOT EXISTS contact_status_set_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_status_set_at     timestamptz,
  ADD COLUMN IF NOT EXISTS next_permissible_contact_at date;

CREATE INDEX IF NOT EXISTS candidates_contact_status_idx
  ON candidates (contact_status) WHERE contact_status <> 'ok';

-- ──────────────────────────────────────────────────────────────────────────────
-- US-026 Job / Requisition Exclusivity Windows
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_exclusivity_windows (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  job_id        uuid        NOT NULL REFERENCES jobs(id)     ON DELETE CASCADE,
  starts_on     date        NOT NULL,
  ends_on       date        NOT NULL,
  contract_ref  text,
  reason        text,
  created_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jew_dates_sane CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS jew_job_idx       ON job_exclusivity_windows (job_id);
CREATE INDEX IF NOT EXISTS jew_agency_idx    ON job_exclusivity_windows (agency_id);
-- Partial index for the "expires in 14 days" alert query
CREATE INDEX IF NOT EXISTS jew_ends_on_idx   ON job_exclusivity_windows (ends_on);

ALTER TABLE job_exclusivity_windows ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='job_exclusivity_windows' AND policyname='jew_agency') THEN
    CREATE POLICY "jew_agency" ON job_exclusivity_windows FOR ALL
      USING      (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-046 Client Portal Audit Trail
--
-- Every meaningful action taken inside a client portal (login, view candidate,
-- thumbs up/down, leave comment, download CV) is written here so the recruiter
-- can see "who did what, when, and how long did it take".
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_portal_events (
  id                 bigserial   PRIMARY KEY,
  agency_id          uuid        NOT NULL REFERENCES agencies(id)  ON DELETE CASCADE,
  company_id         uuid        REFERENCES companies(id)           ON DELETE SET NULL,
  job_id             uuid        REFERENCES jobs(id)                ON DELETE SET NULL,
  candidate_id       uuid        REFERENCES candidates(id)          ON DELETE SET NULL,
  portal_user_email  text,  -- contacts.email when known
  event_type         text        NOT NULL
                                 CHECK (event_type IN ('login','view_candidate','view_job','decision','comment','download_resume','export')),
  decision           text,  -- 'thumbs_up' | 'thumbs_down' | 'interview' etc
  duration_seconds   integer,
  metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cpe_agency_time_idx  ON client_portal_events (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cpe_job_idx          ON client_portal_events (job_id);
CREATE INDEX IF NOT EXISTS cpe_candidate_idx    ON client_portal_events (candidate_id);
CREATE INDEX IF NOT EXISTS cpe_company_idx      ON client_portal_events (company_id);

ALTER TABLE client_portal_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_portal_events' AND policyname='cpe_agency_select') THEN
    CREATE POLICY "cpe_agency_select" ON client_portal_events FOR SELECT
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
  -- Writes come from the portal routes using the service key, so no write policy for agency users.
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-053 Email Rules & Filters
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_filter_rules (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES users(id) ON DELETE CASCADE,  -- null = agency-wide default
  name         text        NOT NULL,
  priority     integer     NOT NULL DEFAULT 100,  -- lower wins on conflict
  match        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- { "sender": "*@competitor.com", "recipient": "...", "subject_regex": "...", "domain": "..." }
  action       text        NOT NULL CHECK (action IN ('ignore','log','log_with_tag')),
  tag          text,
  enabled      boolean     NOT NULL DEFAULT true,
  created_by   uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS efr_agency_idx     ON email_filter_rules (agency_id, priority);
CREATE INDEX IF NOT EXISTS efr_user_idx       ON email_filter_rules (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE email_filter_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='email_filter_rules' AND policyname='efr_agency') THEN
    CREATE POLICY "efr_agency" ON email_filter_rules FOR ALL
      USING      (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-054 Manual Call / Meeting Activity Log
--
-- Rather than add a new table, extend `activities.type` and use a metadata
-- JSONB to hold direction/duration/outcome. activities already has entity_type,
-- entity_id, actor_id, summary and is rendered on the timeline (US-013).
-- ──────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'activity_type' AND e.enumlabel = 'meeting') THEN
    ALTER TYPE activity_type ADD VALUE 'meeting';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-094 In-Product Playbooks & Enablement Library
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS playbooks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  slug          text        NOT NULL,
  title         text        NOT NULL,
  category      text,       -- 'sourcing' | 'intake' | 'submittal' | ...
  body_md       text        NOT NULL,
  video_url     text,
  context_keys  text[]      NOT NULL DEFAULT '{}',  -- e.g. {'boolean_search','intake_form'}
  required      boolean     NOT NULL DEFAULT false,
  required_by   date,
  published     boolean     NOT NULL DEFAULT true,
  created_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pb_agency_slug UNIQUE (agency_id, slug)
);
CREATE INDEX IF NOT EXISTS pb_agency_idx    ON playbooks (agency_id);
CREATE INDEX IF NOT EXISTS pb_context_idx   ON playbooks USING GIN (context_keys);

CREATE TABLE IF NOT EXISTS playbook_reads (
  id            bigserial   PRIMARY KEY,
  agency_id     uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  playbook_id   uuid        NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed     boolean     NOT NULL DEFAULT false,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pbr_unique UNIQUE (playbook_id, user_id)
);
CREATE INDEX IF NOT EXISTS pbr_agency_idx ON playbook_reads (agency_id);

ALTER TABLE playbooks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_reads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='playbooks' AND policyname='pb_agency') THEN
    CREATE POLICY "pb_agency" ON playbooks FOR ALL
      USING      (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='playbook_reads' AND policyname='pbr_agency') THEN
    CREATE POLICY "pbr_agency" ON playbook_reads FOR ALL
      USING      (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-105 A/R & DSO Dashboard
--
-- Invoices table modelling the minimum needed for aging + DSO. In most agencies
-- this is synced from QuickBooks / Xero (future US-102) but for now we support
-- manual creation so the dashboard has data to render.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES agencies(id)  ON DELETE CASCADE,
  company_id      uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  placement_id    uuid        REFERENCES placements(id) ON DELETE SET NULL,
  invoice_number  text        NOT NULL,
  amount          numeric(12,2) NOT NULL,
  currency        text        NOT NULL DEFAULT 'USD',
  issued_on       date        NOT NULL,
  due_on          date        NOT NULL,
  paid_on         date,
  status          text        NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','paid','void','written_off')),
  external_ref    text,       -- QuickBooks / Xero invoice id
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inv_agency_number UNIQUE (agency_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS inv_agency_status_idx ON invoices (agency_id, status);
CREATE INDEX IF NOT EXISTS inv_company_idx       ON invoices (company_id);
CREATE INDEX IF NOT EXISTS inv_due_on_idx        ON invoices (due_on) WHERE status = 'open';

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoices' AND policyname='inv_agency') THEN
    CREATE POLICY "inv_agency" ON invoices FOR ALL
      USING      (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- Aging view — used by the dashboard.
CREATE OR REPLACE VIEW invoices_aging_view AS
SELECT
  i.agency_id, i.company_id, c.name AS company_name, i.id AS invoice_id,
  i.invoice_number, i.amount, i.currency, i.issued_on, i.due_on, i.status,
  CASE
    WHEN i.status <> 'open' THEN 'closed'
    WHEN i.due_on >=  current_date              THEN 'current'
    WHEN i.due_on >=  current_date - interval '30 days' THEN '1_30'
    WHEN i.due_on >=  current_date - interval '60 days' THEN '31_60'
    WHEN i.due_on >=  current_date - interval '90 days' THEN '61_90'
    ELSE '91_plus'
  END AS aging_bucket,
  (current_date - i.due_on)::int AS days_overdue
FROM invoices i
JOIN companies c ON c.id = i.company_id;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-122 Candidate Longlist per Req
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_longlist (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  job_id       uuid        NOT NULL REFERENCES jobs(id)     ON DELETE CASCADE,
  candidate_id uuid        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  rank         integer     NOT NULL DEFAULT 0,
  notes        text,
  promoted     boolean     NOT NULL DEFAULT false,  -- promoted to real submittal
  promoted_at  timestamptz,
  added_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jl_job_candidate UNIQUE (job_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS jl_agency_job_idx ON job_longlist (agency_id, job_id, rank);

ALTER TABLE job_longlist ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='job_longlist' AND policyname='jl_agency') THEN
    CREATE POLICY "jl_agency" ON job_longlist FOR ALL
      USING      (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-124 Calibration Submissions
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS is_calibration boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS applications_calibration_idx
  ON applications (job_id) WHERE is_calibration = true;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-158 BD Win/Loss Reasons & Analytics
--
-- Free-form taxonomy per agency. Recorded on a closed prospect OR a closed req
-- (closed without placement). Recruiter picks from the taxonomy and adds notes.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_close_reason_taxonomy (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  code        text        NOT NULL,   -- 'lost_competitor' | 'client_cancelled' | ...
  label       text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('prospect','req','both')),
  sort_order  integer     NOT NULL DEFAULT 100,
  active      boolean     NOT NULL DEFAULT true,
  CONSTRAINT bdr_agency_code UNIQUE (agency_id, code, kind)
);
CREATE INDEX IF NOT EXISTS bdr_agency_idx ON bd_close_reason_taxonomy (agency_id);

CREATE TABLE IF NOT EXISTS bd_close_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  entity_type      text        NOT NULL CHECK (entity_type IN ('prospect','req')),
  entity_id        uuid        NOT NULL,
  reason_code      text        NOT NULL,
  notes            text,
  competitor_name  text,
  recorded_by      uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bde_agency_idx    ON bd_close_events (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bde_entity_idx    ON bd_close_events (entity_type, entity_id);

ALTER TABLE bd_close_reason_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_close_events          ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bd_close_reason_taxonomy' AND policyname='bdr_agency') THEN
    CREATE POLICY "bdr_agency" ON bd_close_reason_taxonomy FOR ALL
      USING      (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bd_close_events' AND policyname='bde_agency') THEN
    CREATE POLICY "bde_agency" ON bd_close_events FOR ALL
      USING      (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-241 Per-Candidate Stage Visibility Controls
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS visible_to_candidate boolean NOT NULL DEFAULT false;

-- Per-submission override: lets a recruiter hide a normally-visible stage for
-- one candidate (e.g. sensitive exec hire they want to keep private).
CREATE TABLE IF NOT EXISTS application_stage_visibility (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES agencies(id)        ON DELETE CASCADE,
  application_id  uuid        NOT NULL REFERENCES applications(id)    ON DELETE CASCADE,
  stage_id        uuid        NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  visible         boolean     NOT NULL,  -- override of the stage-level default
  created_by      uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asv_unique UNIQUE (application_id, stage_id)
);
CREATE INDEX IF NOT EXISTS asv_application_idx ON application_stage_visibility (application_id);
CREATE INDEX IF NOT EXISTS asv_agency_idx       ON application_stage_visibility (agency_id);

ALTER TABLE application_stage_visibility ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='application_stage_visibility' AND policyname='asv_agency') THEN
    CREATE POLICY "asv_agency" ON application_stage_visibility FOR ALL
      USING      (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-414 Legal Hold / Compliance Hold
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_holds (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  entity_type     text        NOT NULL CHECK (entity_type IN ('candidate','job','company')),
  entity_id       uuid        NOT NULL,
  reason          text        NOT NULL,
  case_ref        text,
  holds_from      date        NOT NULL DEFAULT current_date,
  holds_until     date,       -- null = indefinite
  released_at     timestamptz,
  released_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  released_reason text,
  created_by      uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- Query "is this entity currently on hold?" is O(1) thanks to this partial idx.
CREATE INDEX IF NOT EXISTS lh_active_idx
  ON legal_holds (entity_type, entity_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS lh_agency_idx    ON legal_holds (agency_id, created_at DESC);

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='legal_holds' AND policyname='lh_agency') THEN
    CREATE POLICY "lh_agency" ON legal_holds FOR ALL
      USING      (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- Helper function used by delete paths: raises if the entity is on active hold.
CREATE OR REPLACE FUNCTION assert_not_legally_held(p_entity_type text, p_entity_id uuid)
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM legal_holds
     WHERE entity_type = p_entity_type
       AND entity_id   = p_entity_id
       AND released_at IS NULL
       AND (holds_until IS NULL OR holds_until >= current_date)
  ) THEN
    RAISE EXCEPTION 'Cannot delete %/% — active legal hold', p_entity_type, p_entity_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-423 Pay Transparency & Equity Report
--
-- Adds offered/accepted snapshot fields directly on offer_rounds. Demographic
-- join is via candidates.dei_* (set elsewhere, nullable — recruiter never sees
-- PII directly; only rolled up in the admin-only report).
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE offer_rounds
  ADD COLUMN IF NOT EXISTS offered_base_salary  numeric(12,2),
  ADD COLUMN IF NOT EXISTS accepted_base_salary numeric(12,2),
  ADD COLUMN IF NOT EXISTS accepted_at          timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason       text;

-- ──────────────────────────────────────────────────────────────────────────────
-- US-444 Per-User External-AI Activity Audit
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS oauth_client_id text,  -- the external AI app's OAuth client
  ADD COLUMN IF NOT EXISTS oauth_client_name text,
  ADD COLUMN IF NOT EXISTS tool_name         text, -- MCP tool invoked
  ADD COLUMN IF NOT EXISTS prompt_hash       text, -- sha-256 of sanitised prompt
  ADD COLUMN IF NOT EXISTS model_name        text; -- which LLM

CREATE INDEX IF NOT EXISTS audit_oauth_client_idx ON audit_log (oauth_client_id) WHERE oauth_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_tool_name_idx    ON audit_log (tool_name)       WHERE tool_name       IS NOT NULL;

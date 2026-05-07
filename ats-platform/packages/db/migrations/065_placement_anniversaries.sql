-- ── Migration 065: Placement Anniversary & Backfill Alerts (US-231) ──────────
--
-- Re-engagement surface for agency recruiters. Placed candidates often become
-- sourceable again at predictable intervals (18/24/36 months — the typical
-- "itch to move" windows based on industry tenure data). Surfacing these at
-- the right moment turns a cold dataset into warm inbound.
--
-- Two complementary signals:
--
--   1. Candidate anniversary: "X placed at Company Y 24 months ago —
--      good time to check in about a new role"
--   2. Backfill alert: "X placed at Company Y 18 months ago — odds are
--      they'll leave in the next 6-12 months; line up a backfill role
--      with Company Y now"
--
-- We materialise alerts into a table so the UI can render them without
-- re-running the date math, and so we can track whether a recruiter has
-- acted on each one (dismissed / engaged / snoozed). An alert for a given
-- (placement_id, milestone) is unique — the nightly cron upserts.
--
-- Idempotent: safe to re-run.

-- ── placement_anniversaries ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS placement_anniversaries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id          uuid NOT NULL REFERENCES agencies(id)   ON DELETE CASCADE,
  placement_id       uuid NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  candidate_id       uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id             uuid REFERENCES jobs(id)                ON DELETE SET NULL,
  -- Client company the candidate was placed *at*. Lets backfill alerts
  -- point at the ongoing relationship even after job_id is archived.
  company_id         uuid REFERENCES companies(id)           ON DELETE SET NULL,
  -- Milestone in months. 18/24/36 are the defaults the cron fires; we leave
  -- it as smallint so agencies can customise later (e.g. 12/24 for high-churn
  -- markets).
  milestone_months   smallint NOT NULL CHECK (milestone_months BETWEEN 1 AND 120),
  -- Whether this row represents the candidate-side re-engagement or the
  -- client-side backfill opportunity. A single placement anniversary can
  -- generate BOTH kinds of alert.
  alert_kind         text NOT NULL CHECK (alert_kind IN ('candidate_reengage','client_backfill')),
  -- The actual anniversary date — start_date + interval 'milestone_months months'.
  -- Materialised so we can index it and drive due-date sorts.
  anniversary_date   date NOT NULL,
  -- Recruiter workflow state.
  status             text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','dismissed','engaged','snoozed')),
  snoozed_until      date,
  dismissed_at       timestamptz,
  engaged_at         timestamptz,
  engaged_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Recruiter-visible auto-generated explanation ("Jane was placed at
  -- Acme 24 months ago — top re-engagement window starts now").
  rationale          text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (placement_id, milestone_months, alert_kind)
);

CREATE INDEX IF NOT EXISTS placement_anniversaries_agency_status_idx
  ON placement_anniversaries (agency_id, status, anniversary_date DESC);

CREATE INDEX IF NOT EXISTS placement_anniversaries_due_idx
  ON placement_anniversaries (anniversary_date)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS placement_anniversaries_candidate_idx
  ON placement_anniversaries (candidate_id, anniversary_date DESC);

CREATE INDEX IF NOT EXISTS placement_anniversaries_company_idx
  ON placement_anniversaries (company_id, anniversary_date DESC)
  WHERE company_id IS NOT NULL;

COMMENT ON TABLE placement_anniversaries IS
  'US-231: Nightly-materialised re-engagement + backfill alerts at 18/24/36mo after placement start. One row per (placement, milestone, kind). UNIQUE constraint makes the cron upsert idempotent.';

-- ── updated_at trigger ──────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS placement_anniversaries_updated_at ON placement_anniversaries;
CREATE TRIGGER placement_anniversaries_updated_at
  BEFORE UPDATE ON placement_anniversaries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE placement_anniversaries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'placement_anniversaries' AND policyname = 'placement_anniv_select'
  ) THEN
    CREATE POLICY placement_anniv_select ON placement_anniversaries FOR SELECT
      USING (agency_id = current_agency_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'placement_anniversaries' AND policyname = 'placement_anniv_update'
  ) THEN
    -- Recruiters can dismiss / engage / snooze their own agency's alerts.
    -- Inserts flow exclusively from the cron job (service role).
    CREATE POLICY placement_anniv_update ON placement_anniversaries FOR UPDATE
      USING      (agency_id = current_agency_id())
      WITH CHECK (agency_id = current_agency_id());
  END IF;
END $$;

-- ── Helper view: open alerts with joined names for UI  ──────────────────────
--
-- Powers the dashboard alerts card without needing a complex client-side
-- join. Kept as a VIEW so RLS on the base table flows through.

CREATE OR REPLACE VIEW placement_anniversaries_view AS
SELECT
  pa.id,
  pa.agency_id,
  pa.placement_id,
  pa.candidate_id,
  pa.job_id,
  pa.company_id,
  pa.milestone_months,
  pa.alert_kind,
  pa.anniversary_date,
  pa.status,
  pa.snoozed_until,
  pa.rationale,
  pa.created_at,
  c.first_name            AS candidate_first_name,
  c.last_name             AS candidate_last_name,
  c.email                 AS candidate_email,
  c.current_title         AS candidate_current_title,
  co.name                 AS company_name,
  j.title                 AS job_title
FROM   placement_anniversaries pa
LEFT   JOIN candidates c  ON c.id  = pa.candidate_id
LEFT   JOIN companies  co ON co.id = pa.company_id
LEFT   JOIN jobs       j  ON j.id  = pa.job_id;

COMMENT ON VIEW placement_anniversaries_view IS
  'US-231: Joined placement-anniversary alerts with candidate/company/job names for the dashboard card.';

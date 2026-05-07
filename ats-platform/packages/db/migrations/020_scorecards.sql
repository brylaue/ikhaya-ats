-- Migration 017: Interview Scorecards & Structured Ratings
-- Scorecards allow interviewers to rate candidates across defined criteria.

-- ── Scorecard templates ────────────────────────────────────────────────────────
-- Reusable templates attached to a job (or global to the agency).
CREATE TABLE IF NOT EXISTS scorecard_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  job_id      uuid REFERENCES jobs(id) ON DELETE SET NULL, -- null = global template
  name        text NOT NULL,
  description text,
  criteria    jsonb NOT NULL DEFAULT '[]',
  -- criteria shape: [{ id, label, description, weight, scale }]
  -- scale: 1-5 (default) or custom
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scorecard_templates_agency ON scorecard_templates(agency_id);
CREATE INDEX idx_scorecard_templates_job    ON scorecard_templates(job_id) WHERE job_id IS NOT NULL;

-- ── Scorecard submissions ──────────────────────────────────────────────────────
-- One submission per interviewer per candidate per interview stage.
CREATE TABLE IF NOT EXISTS scorecard_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES scorecard_templates(id) ON DELETE SET NULL,
  candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id          uuid REFERENCES jobs(id) ON DELETE SET NULL,
  interviewer_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage           text,        -- pipeline stage this scorecard is for
  overall_rating  numeric(3,1) CHECK (overall_rating BETWEEN 1 AND 5),
  recommendation  text CHECK (recommendation IN ('strong_yes','yes','no','strong_no')),
  ratings         jsonb NOT NULL DEFAULT '{}',
  -- ratings shape: { [criteriaId]: { score, note } }
  notes           text,
  submitted_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, job_id, interviewer_id, stage)
);

CREATE INDEX idx_scorecard_submissions_agency     ON scorecard_submissions(agency_id);
CREATE INDEX idx_scorecard_submissions_candidate  ON scorecard_submissions(candidate_id);
CREATE INDEX idx_scorecard_submissions_job        ON scorecard_submissions(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_scorecard_submissions_interviewer ON scorecard_submissions(interviewer_id);

-- ── updated_at triggers ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_scorecard_templates_updated_at
    BEFORE UPDATE ON scorecard_templates
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_scorecard_submissions_updated_at
    BEFORE UPDATE ON scorecard_submissions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE scorecard_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_submissions  ENABLE ROW LEVEL SECURITY;

-- Templates: agency members can do everything
CREATE POLICY "agency members manage scorecard templates"
  ON scorecard_templates FOR ALL
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

-- Submissions: agency members can read all; only the submitter can insert/update their own
CREATE POLICY "agency members read scorecard submissions"
  ON scorecard_submissions FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "interviewers manage own submissions"
  ON scorecard_submissions FOR INSERT
  WITH CHECK (interviewer_id = auth.uid());

CREATE POLICY "interviewers update own submissions"
  ON scorecard_submissions FOR UPDATE
  USING (interviewer_id = auth.uid());

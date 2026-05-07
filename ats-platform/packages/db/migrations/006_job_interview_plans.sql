-- Migration 006: job_interview_plans
--
-- Stores the per-job interview plan as a JSONB array of stage objects.
-- Each stage mirrors the InterviewStage TypeScript interface:
--   { id, name, format, durationMins, ownerId?, description?, scorecardRequired, schedulingUrl? }
--
-- One row per job (UNIQUE on job_id). The application uses upsert
-- (INSERT ... ON CONFLICT job_id DO UPDATE) to save/overwrite the plan.

CREATE TABLE IF NOT EXISTS job_interview_plans (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id  uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  job_id     uuid        NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,

  stages     jsonb       NOT NULL DEFAULT '[]',
  notes      text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-agency lookups
CREATE INDEX IF NOT EXISTS job_interview_plans_agency_idx
  ON job_interview_plans (agency_id);

-- RLS: agency members can only access their own plans
ALTER TABLE job_interview_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_interview_plans_select"
  ON job_interview_plans FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency_interview_plans_insert"
  ON job_interview_plans FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency_interview_plans_update"
  ON job_interview_plans FOR UPDATE
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency_interview_plans_delete"
  ON job_interview_plans FOR DELETE
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

-- Auto-update updated_at on every write
CREATE OR REPLACE FUNCTION update_job_interview_plans_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER job_interview_plans_updated_at
  BEFORE UPDATE ON job_interview_plans
  FOR EACH ROW EXECUTE FUNCTION update_job_interview_plans_updated_at();

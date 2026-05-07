-- Migration 004: scheduled_interviews table
-- Stores interview records created via the schedule-interview modal.

CREATE TABLE IF NOT EXISTS scheduled_interviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Candidate / job context
  candidate_id     uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  candidate_name   text NOT NULL,
  candidate_title  text,
  job_id           uuid REFERENCES jobs(id) ON DELETE SET NULL,
  job_title        text,
  client_name      text,

  -- Scheduling
  date             date NOT NULL,
  start_time       time NOT NULL,
  end_time         time NOT NULL,
  format           text NOT NULL CHECK (format IN ('video', 'phone', 'in_person', 'panel')),
  location         text,
  meeting_link     text,

  -- Participants stored as JSONB array:
  -- [{ id, name, email, role, isExternal }]
  interviewers     jsonb NOT NULL DEFAULT '[]',

  -- Meta
  notes            text,
  notify_candidate boolean NOT NULL DEFAULT true,
  notify_client    boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),

  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups per agency, date, and candidate
CREATE INDEX IF NOT EXISTS scheduled_interviews_agency_date_idx
  ON scheduled_interviews (agency_id, date);

CREATE INDEX IF NOT EXISTS scheduled_interviews_candidate_idx
  ON scheduled_interviews (candidate_id);

CREATE INDEX IF NOT EXISTS scheduled_interviews_job_idx
  ON scheduled_interviews (job_id);

-- RLS: recruiter can only see their agency's interviews
ALTER TABLE scheduled_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_interviews_select"
  ON scheduled_interviews FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency_interviews_insert"
  ON scheduled_interviews FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency_interviews_update"
  ON scheduled_interviews FOR UPDATE
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency_interviews_delete"
  ON scheduled_interviews FOR DELETE
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_scheduled_interviews_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER scheduled_interviews_updated_at
  BEFORE UPDATE ON scheduled_interviews
  FOR EACH ROW EXECUTE FUNCTION update_scheduled_interviews_updated_at();

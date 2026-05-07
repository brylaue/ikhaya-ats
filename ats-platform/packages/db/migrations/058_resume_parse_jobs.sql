-- ── Migration 058: Async Resume Parser Pipeline (US-380) ─────────────────────
--
-- Backing table for async resume parsing. The enqueue route extracts text
-- synchronously (that's cheap) and writes a pending row; a cron worker
-- processes the backlog by calling Claude and updating the candidate.
--
-- Client UI polls GET /api/resume-parse-jobs/[id] for status.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS resume_parse_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  enqueued_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'done', 'error')),
  file_name     text NOT NULL,
  file_size     bigint,
  file_ext      text,
  raw_text      text,                       -- extracted once at enqueue
  parsed_data   jsonb,                      -- Claude output on completion
  fields_updated text[],                    -- what was actually written back
  error_text    text,
  attempts      integer NOT NULL DEFAULT 0,
  queued_at     timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS resume_parse_jobs_status_idx
  ON resume_parse_jobs(status, queued_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS resume_parse_jobs_agency_idx
  ON resume_parse_jobs(agency_id, queued_at DESC);

CREATE INDEX IF NOT EXISTS resume_parse_jobs_candidate_idx
  ON resume_parse_jobs(candidate_id, queued_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE resume_parse_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'resume_parse_jobs' AND policyname = 'parse_jobs_agency_select'
  ) THEN
    CREATE POLICY parse_jobs_agency_select ON resume_parse_jobs
      FOR SELECT
      USING (agency_id = current_agency_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'resume_parse_jobs' AND policyname = 'parse_jobs_agency_insert'
  ) THEN
    CREATE POLICY parse_jobs_agency_insert ON resume_parse_jobs
      FOR INSERT
      WITH CHECK (agency_id = current_agency_id());
  END IF;

  -- UPDATE / DELETE are service-role only — cron worker & admin cleanup.
END $$;

-- ── Claim helper: atomically grab the next pending job ───────────────────────

CREATE OR REPLACE FUNCTION claim_next_resume_parse_job()
RETURNS resume_parse_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  job resume_parse_jobs;
BEGIN
  UPDATE resume_parse_jobs
  SET    status       = 'processing',
         started_at   = now(),
         attempts     = attempts + 1
  WHERE  id = (
    SELECT id
    FROM   resume_parse_jobs
    WHERE  status = 'pending'
    ORDER  BY queued_at ASC
    LIMIT  1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO job;

  RETURN job;
END;
$$;

COMMENT ON FUNCTION claim_next_resume_parse_job IS
  'US-380: atomic dequeue with SKIP LOCKED so multiple workers don''t race. Returns NULL row when queue is empty.';

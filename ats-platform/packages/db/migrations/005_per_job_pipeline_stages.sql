-- Migration 005: per-job pipeline stages
--
-- The original pipeline_stages table was designed around a shared "pipeline"
-- template (pipeline_id FK). In practice, the application creates stages
-- directly per-job, so we extend the table with the columns the hooks expect:
--   job_id, agency_id, client_name, position, is_default
--
-- The original pipeline_id column is kept for backward-compatibility.

-- ─── New columns ──────────────────────────────────────────────────────────────

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS job_id      uuid REFERENCES jobs(id)     ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS agency_id   uuid REFERENCES agencies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS position    smallint,
  ADD COLUMN IF NOT EXISTS is_default  boolean NOT NULL DEFAULT false;

-- Back-fill position from stage_order for any existing rows
UPDATE pipeline_stages
   SET position = stage_order
 WHERE position IS NULL;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS pipeline_stages_job_id_idx
  ON pipeline_stages (job_id);

CREATE INDEX IF NOT EXISTS pipeline_stages_agency_id_idx
  ON pipeline_stages (agency_id);

CREATE INDEX IF NOT EXISTS pipeline_stages_job_position_idx
  ON pipeline_stages (job_id, position);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_stages_select"
  ON pipeline_stages FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency_stages_insert"
  ON pipeline_stages FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency_stages_update"
  ON pipeline_stages FOR UPDATE
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency_stages_delete"
  ON pipeline_stages FOR DELETE
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

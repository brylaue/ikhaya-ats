-- Migration 020: Multi-recruiter requisition assignment
-- Allows multiple recruiters to be co-assigned to a single job requisition
-- Each recruiter can have a role: lead, support, sourcer, coordinator

CREATE TABLE IF NOT EXISTS job_recruiters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'support'
               CHECK (role IN ('lead', 'support', 'sourcer', 'coordinator')),
  assigned_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (job_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_job_recruiters_job_id  ON job_recruiters(job_id);
CREATE INDEX IF NOT EXISTS idx_job_recruiters_user_id ON job_recruiters(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE job_recruiters ENABLE ROW LEVEL SECURITY;

-- Members can see assignments for jobs in their agency
CREATE POLICY "job_recruiters_select" ON job_recruiters
  FOR SELECT USING (
    job_id IN (
      SELECT j.id FROM jobs j
      JOIN users u ON u.agency_id = j.agency_id
      WHERE u.id = auth.uid()
    )
  );

-- Members can insert assignments for jobs in their agency
CREATE POLICY "job_recruiters_insert" ON job_recruiters
  FOR INSERT WITH CHECK (
    job_id IN (
      SELECT j.id FROM jobs j
      JOIN users u ON u.agency_id = j.agency_id
      WHERE u.id = auth.uid()
    )
  );

-- Members can update assignments for jobs in their agency
CREATE POLICY "job_recruiters_update" ON job_recruiters
  FOR UPDATE USING (
    job_id IN (
      SELECT j.id FROM jobs j
      JOIN users u ON u.agency_id = j.agency_id
      WHERE u.id = auth.uid()
    )
  );

-- Members can delete assignments for jobs in their agency
CREATE POLICY "job_recruiters_delete" ON job_recruiters
  FOR DELETE USING (
    job_id IN (
      SELECT j.id FROM jobs j
      JOIN users u ON u.agency_id = j.agency_id
      WHERE u.id = auth.uid()
    )
  );

-- Migration 021: Off-limits / hands-off candidate lists
-- An off-limits rule prevents a candidate from being submitted to a specific client
-- (or all clients if company_id is NULL) for the duration of the restriction.
-- Common use-case: a candidate placed at Client A is off-limits to competitors for 12 months.

CREATE TABLE IF NOT EXISTS off_limits_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  -- NULL company_id means "all clients" (universal off-limits)
  company_id    uuid REFERENCES companies(id) ON DELETE CASCADE,
  reason        text,
  -- NULL expires_at means the rule never expires
  expires_at    timestamptz,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate rules for the same candidate+client pair
  UNIQUE (agency_id, candidate_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_off_limits_candidate  ON off_limits_rules(candidate_id);
CREATE INDEX IF NOT EXISTS idx_off_limits_company    ON off_limits_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_off_limits_agency     ON off_limits_rules(agency_id);
CREATE INDEX IF NOT EXISTS idx_off_limits_expires    ON off_limits_rules(expires_at);

-- Trigger: keep updated_at current
DO $$ BEGIN
  CREATE TRIGGER off_limits_updated_at
    BEFORE UPDATE ON off_limits_rules
    FOR EACH ROW EXECUTE PROCEDURE touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE off_limits_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "off_limits_select" ON off_limits_rules
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "off_limits_insert" ON off_limits_rules
  FOR INSERT WITH CHECK (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "off_limits_update" ON off_limits_rules
  FOR UPDATE USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "off_limits_delete" ON off_limits_rules
  FOR DELETE USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

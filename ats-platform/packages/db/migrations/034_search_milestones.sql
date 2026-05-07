-- Migration 026: Retained Search Milestone Billing (US-104)
-- Tracks milestone billing tranches for retained search engagements.

-- Milestone definitions per job (retained search only)
CREATE TABLE IF NOT EXISTS search_milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name            text NOT NULL,                        -- e.g. "Engagement Fee", "Shortlist Delivery", "Placement"
  tranche_pct     numeric(5,2) NOT NULL,                -- % of total retained fee
  amount          numeric(12,2),                        -- computed from retained_fee * tranche_pct
  due_date        date,                                 -- expected invoice date
  invoiced_at     timestamptz,
  invoice_number  text,
  paid_at         timestamptz,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','invoiced','paid','waived')),
  notes           text,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestones_job    ON search_milestones(job_id);
CREATE INDEX IF NOT EXISTS idx_milestones_agency ON search_milestones(agency_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON search_milestones(status);

DO $$ BEGIN
  CREATE TRIGGER milestones_updated_at
    BEFORE UPDATE ON search_milestones
    FOR EACH ROW EXECUTE PROCEDURE touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE search_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "milestones_select" ON search_milestones FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "milestones_insert" ON search_milestones FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "milestones_update" ON search_milestones FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "milestones_delete" ON search_milestones FOR DELETE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

-- ── Add retained_fee to jobs ──────────────────────────────────────────────────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS fee_model    text DEFAULT 'contingency'
    CHECK (fee_model IN ('contingency','retained','container')),
  ADD COLUMN IF NOT EXISTS retained_fee numeric(12,2);

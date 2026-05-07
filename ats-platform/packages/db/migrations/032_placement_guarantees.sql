-- Migration 025: Placement Guarantee & Replacement Workflow (US-101)
-- Tracks guarantee periods for placements and any replacement events.

-- Adds guarantee columns to placements table (if not already present)
ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS guarantee_days     integer,
  ADD COLUMN IF NOT EXISTS guarantee_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS guarantee_status   text DEFAULT 'active'
    CHECK (guarantee_status IN ('active','at_risk','breached','waived','cleared'));

-- Replacement events — when a guaranteed candidate leaves
CREATE TABLE IF NOT EXISTS placement_replacements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id            uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  original_placement_id uuid NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  replacement_placement_id uuid REFERENCES placements(id) ON DELETE SET NULL,
  candidate_left_at    timestamptz NOT NULL,
  reason               text,                     -- termination, resignation, performance, etc.
  replacement_started_at timestamptz,
  replacement_deadline timestamptz,              -- contractual replacement deadline
  status               text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','in_progress','filled','waived','expired')),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replacements_orig    ON placement_replacements(original_placement_id);
CREATE INDEX IF NOT EXISTS idx_replacements_agency  ON placement_replacements(agency_id);

DO $$ BEGIN
  CREATE TRIGGER replacements_updated_at
    BEFORE UPDATE ON placement_replacements
    FOR EACH ROW EXECUTE PROCEDURE touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE placement_replacements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replacements_select" ON placement_replacements FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "replacements_insert" ON placement_replacements FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "replacements_update" ON placement_replacements FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "replacements_delete" ON placement_replacements FOR DELETE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

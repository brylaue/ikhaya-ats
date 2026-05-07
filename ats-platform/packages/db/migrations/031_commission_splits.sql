-- Migration 024: Commission & Split Tracking (US-100)
-- Tracks how placement fees are split across recruiters, with payout status.

CREATE TABLE IF NOT EXISTS commission_splits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  placement_id    uuid NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  split_pct       numeric(5, 2) NOT NULL CHECK (split_pct > 0 AND split_pct <= 100),
  -- Computed amount = placement.fee_amount * split_pct / 100
  amount          numeric(14, 2),
  role            text NOT NULL DEFAULT 'recruiter'
                  CHECK (role IN ('recruiter','sourcer','account_manager','coordinator','lead')),
  payout_status   text NOT NULL DEFAULT 'pending'
                  CHECK (payout_status IN ('pending','approved','paid','held')),
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (placement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_splits_placement ON commission_splits(placement_id);
CREATE INDEX IF NOT EXISTS idx_commission_splits_user      ON commission_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_splits_agency    ON commission_splits(agency_id);

DO $$ BEGIN
  CREATE TRIGGER commission_splits_updated_at
    BEFORE UPDATE ON commission_splits
    FOR EACH ROW EXECUTE PROCEDURE touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE commission_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comm_splits_select" ON commission_splits FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "comm_splits_insert" ON commission_splits FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "comm_splits_update" ON commission_splits FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "comm_splits_delete" ON commission_splits FOR DELETE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

-- ─── Migration 071: Book-of-Business Transfer & Search Features ──────────────
-- US-093: Book-of-Business Transfer (admin bulk record reassignment)
-- US-493: Search Analytics Dashboard (uses search_signals from migration 066)

-- ─── US-093: Book-of-Business Transfer ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS biz_transfers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Source and destination users
  from_user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  to_user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Counts by record type (filled after execution)
  candidates_transferred  INTEGER     DEFAULT 0,
  jobs_transferred        INTEGER     DEFAULT 0,
  clients_transferred     INTEGER     DEFAULT 0,
  tasks_transferred       INTEGER     DEFAULT 0,

  -- Execution state
  status          TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'previewing', 'executing', 'completed', 'failed')),
  error_detail    TEXT,

  -- Optional dual-owner window (both users retain access for N days)
  dual_owner_days INTEGER,
  dual_owner_until TIMESTAMPTZ,

  -- Who initiated
  initiated_by    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  completed_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS biz_transfers_agency_idx    ON biz_transfers (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS biz_transfers_from_user_idx ON biz_transfers (from_user_id);
CREATE INDEX IF NOT EXISTS biz_transfers_to_user_idx   ON biz_transfers (to_user_id);

ALTER TABLE biz_transfers ENABLE ROW LEVEL SECURITY;

-- Only agency admins/owners manage transfers
CREATE POLICY "biz_transfers_agency_admin" ON biz_transfers FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE TRIGGER biz_transfers_updated_at
  BEFORE UPDATE ON biz_transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE biz_transfers IS
  'Audit trail for admin bulk reassignment of all records owned by one '
  'recruiter to another (candidate departure, role change, etc.).';

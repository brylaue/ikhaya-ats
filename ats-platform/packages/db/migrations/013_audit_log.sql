-- Migration 011: Global audit log
-- Immutable append-only log of user actions across the platform.
-- No UPDATE/DELETE policies — records are write-once.

CREATE TABLE audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES users(id) ON DELETE SET NULL,
  action       text        NOT NULL,   -- e.g. "candidate.create", "job.status_change"
  entity_type  text        NOT NULL,   -- "candidate" | "job" | "contact" | "company" | ...
  entity_id    uuid,                   -- id of the affected row
  entity_label text,                   -- human-readable label at time of action
  metadata     jsonb       NOT NULL DEFAULT '{}',
  ip_address   inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX audit_log_agency_id_idx    ON audit_log (agency_id, created_at DESC);
CREATE INDEX audit_log_user_id_idx      ON audit_log (user_id,   created_at DESC);
CREATE INDEX audit_log_entity_idx       ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_log_action_idx       ON audit_log (agency_id, action, created_at DESC);

-- Row Level Security
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Agency members can read their own agency's log
CREATE POLICY "agency members can read audit log"
  ON audit_log FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

-- Any authenticated agency member can insert entries
CREATE POLICY "agency members can insert audit log"
  ON audit_log FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

-- No UPDATE or DELETE policies — audit log is immutable

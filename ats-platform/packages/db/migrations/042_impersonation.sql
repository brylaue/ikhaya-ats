-- Migration 034: Admin Impersonation Sessions (US-403)
-- Owners can temporarily act as another user with full audit trail.
-- Every action during impersonation must be tagged with impersonator_id.

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  impersonator_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id           UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  -- Reason recorded for audit
  reason              TEXT,
  -- Target user must consent before session activates
  consented_at        TIMESTAMPTZ,
  consent_token       TEXT UNIQUE,            -- short-lived token sent to target user
  consent_token_exp   TIMESTAMPTZ,
  -- Session lifecycle
  started_at          TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS impersonation_sessions_impersonator_idx
  ON impersonation_sessions (impersonator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS impersonation_sessions_target_idx
  ON impersonation_sessions (target_user_id, created_at DESC);

-- RLS: owners/admins can read their own initiated sessions; targets can read sessions
-- targeting them. Service role writes.
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "impersonation_read_own" ON impersonation_sessions
  FOR SELECT USING (
    auth.uid() = impersonator_id OR auth.uid() = target_user_id
  );

-- Add impersonation_session_id column to audit_events if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_events') THEN
    ALTER TABLE audit_events
      ADD COLUMN IF NOT EXISTS impersonation_session_id UUID REFERENCES impersonation_sessions(id);

    CREATE INDEX IF NOT EXISTS audit_events_impersonation_idx
      ON audit_events (impersonation_session_id)
      WHERE impersonation_session_id IS NOT NULL;
  END IF;
END $$;

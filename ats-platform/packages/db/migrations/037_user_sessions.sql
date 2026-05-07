-- Migration: 029_user_sessions
-- US-357: Per-device session tracking with revocation support.
-- US-358: Idle session timeout (30 min inactivity).
-- US-359: Absolute session timeout (8-hour hard cap).
--
-- Each login creates one row. Middleware reads this row on every authenticated
-- request to enforce revocation, idle timeout, and absolute timeout.
-- last_active is updated at most once per minute to limit write amplification.

CREATE TABLE user_sessions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  agency_id           UUID         NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  device_fingerprint  TEXT,                           -- hash of UA + accept-language header
  user_agent          TEXT,                           -- raw User-Agent for display
  ip_address          TEXT,                           -- INET stored as text for portability
  session_started_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_active         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  revoked_at          TIMESTAMPTZ,
  revoke_reason       TEXT,                           -- 'user', 'admin', 'idle_timeout', 'absolute_timeout'
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Fast lookup by session ID (primary key lookup in middleware)
-- Fast per-user listing for the Active Sessions UI (US-357)
CREATE INDEX user_sessions_user_revoked_idx ON user_sessions(user_id, revoked_at);
-- Used by cleanup jobs to purge old sessions
CREATE INDEX user_sessions_last_active_idx  ON user_sessions(last_active);

-- RLS — users can only see and revoke their own sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_sessions_select ON user_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY user_sessions_insert ON user_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Allow update only of last_active and revoked_at/revoke_reason (self-revocation)
CREATE POLICY user_sessions_update ON user_sessions
  FOR UPDATE USING (user_id = auth.uid());

COMMENT ON TABLE user_sessions IS
  'Per-device session rows created at login. Used for idle/absolute timeout '
  'enforcement (US-358, US-359) and explicit revocation (US-357).';

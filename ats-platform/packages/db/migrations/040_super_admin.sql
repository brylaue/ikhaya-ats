-- Migration 032: Super Admin Portal support
-- US-455–US-462: Columns and indexes required by the /super-admin routes.

-- ─── agencies: feature overrides + plan expiry ───────────────────────────────

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS feature_overrides  jsonb    DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS plan_expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS domain             text;

COMMENT ON COLUMN agencies.feature_overrides IS
  'Per-agency feature flag overrides: { "<feature_key>": true|false }. '
  'Null values fall back to plan defaults. Managed via super-admin portal.';

COMMENT ON COLUMN agencies.plan_expires_at IS
  'Optional plan expiry timestamp. Null = no expiry.';

-- ─── users: last_login_at, is_active ─────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at  timestamptz,
  ADD COLUMN IF NOT EXISTS is_active      boolean NOT NULL DEFAULT true;

-- Keep last_login_at up to date on auth sign-ins via Supabase Auth hook
-- (the auth.uid() trigger is set up in 029_user_sessions.sql)

-- ─── audit_log: super-admin specific indexes ─────────────────────────────────

-- Speed up the cross-org audit feed
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at
  ON audit_log (performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_agency_performed
  ON audit_log (agency_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON audit_log USING gin (to_tsvector('english', action));

-- ─── RLS: audit_log is readable only by service role (no user-facing RLS) ────
-- Super-admin API routes use service-role key which bypasses RLS entirely.
-- No additional RLS policies needed here.

-- ─── user_sessions: agency_id index ──────────────────────────────────────────
-- Ensure MAU queries on user_sessions are fast.

CREATE INDEX IF NOT EXISTS idx_user_sessions_agency_last_active
  ON user_sessions (agency_id, last_active DESC);

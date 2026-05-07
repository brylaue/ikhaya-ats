-- ============================================================
-- Migration 009: Email Sync Preferences
-- PostgreSQL 17 / Supabase
--
-- Tracks user opt-in/decline state for the email sync feature.
-- Used by the post-login opt-in modal to gate re-prompt logic:
--   - First decline → re-show 7 days later, once.
--   - Second decline → never auto-show again.
--   - User can always enable from Settings → Integrations.
--
-- RLS: user-scoped via auth.uid()
-- ============================================================

CREATE TABLE user_email_sync_preferences (
  user_id              UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  decline_count        INT         NOT NULL DEFAULT 0,
  last_declined_at     TIMESTAMPTZ,
  reminder_shown_at    TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_user_email_sync_preferences_updated_at
  BEFORE UPDATE ON user_email_sync_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Row-Level Security ──────────────────────────────────────────────────────

ALTER TABLE user_email_sync_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_email_sync_preferences_select ON user_email_sync_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY user_email_sync_preferences_insert ON user_email_sync_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY user_email_sync_preferences_update ON user_email_sync_preferences
  FOR UPDATE USING (user_id = auth.uid());

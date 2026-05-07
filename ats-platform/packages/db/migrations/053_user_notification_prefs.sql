-- ─── Migration 053: User Notification Preferences (US-478) ──────────────────
-- Per-user notification channel preferences.
--
-- One row per user. `prefs` is a JSONB map keyed by notification type.
-- Each value is a { email: bool, inApp: bool } record.
--
-- Example:
--   {
--     "stage_change":    { "email": false, "inApp": true  },
--     "client_feedback": { "email": true,  "inApp": true  },
--     "task_due":        { "email": true,  "inApp": true  },
--     "saved_search":    { "email": true,  "inApp": false },
--     "outreach_reply":  { "email": true,  "inApp": true  },
--     "weekly_summary":  { "email": true,  "inApp": false },
--     "new_candidate":   { "email": true,  "inApp": true  }
--   }
--
-- Missing keys default to both channels = ON (fail-open).

CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  agency_id  UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  prefs      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_notification_prefs_agency_idx
  ON user_notification_prefs(agency_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE user_notification_prefs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_notification_prefs' AND policyname = 'own_prefs_select'
  ) THEN
    CREATE POLICY "own_prefs_select" ON user_notification_prefs
      FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_notification_prefs' AND policyname = 'own_prefs_insert'
  ) THEN
    CREATE POLICY "own_prefs_insert" ON user_notification_prefs
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_notification_prefs' AND policyname = 'own_prefs_update'
  ) THEN
    CREATE POLICY "own_prefs_update" ON user_notification_prefs
      FOR UPDATE USING (user_id = auth.uid())
                  WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ─── Trigger: maintain updated_at ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION user_notification_prefs_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'user_notification_prefs_updated_at') THEN
    CREATE TRIGGER user_notification_prefs_updated_at
      BEFORE UPDATE ON user_notification_prefs
      FOR EACH ROW EXECUTE FUNCTION user_notification_prefs_touch_updated_at();
  END IF;
END $$;

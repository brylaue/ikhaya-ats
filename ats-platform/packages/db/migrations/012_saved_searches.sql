-- Migration 010: Saved searches
-- Stores candidate search filters + alert preferences per recruiter.
-- Alerts are processed by a cron job that compares current results against
-- the saved result_count and fires notifications for new matches.

CREATE TABLE saved_searches (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES agencies(id)  ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  name            text        NOT NULL,
  query           text        NOT NULL DEFAULT '',
  status_filter   text        NOT NULL DEFAULT 'all',
  source_filter   text        NOT NULL DEFAULT 'all',
  alerts_enabled  boolean     NOT NULL DEFAULT true,
  alert_frequency text        NOT NULL DEFAULT 'daily'
                              CHECK (alert_frequency IN ('instant', 'daily', 'weekly')),
  result_count    integer     NOT NULL DEFAULT 0,
  last_alerted_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX saved_searches_user_id_idx   ON saved_searches (user_id);
CREATE INDEX saved_searches_agency_id_idx ON saved_searches (agency_id);
CREATE INDEX saved_searches_alerts_idx    ON saved_searches (agency_id, alerts_enabled)
  WHERE alerts_enabled = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_saved_searches_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER saved_searches_updated_at
  BEFORE UPDATE ON saved_searches
  FOR EACH ROW EXECUTE FUNCTION update_saved_searches_updated_at();

-- Row Level Security
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own saved searches"
  ON saved_searches FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users can insert own saved searches"
  ON saved_searches FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can update own saved searches"
  ON saved_searches FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "users can delete own saved searches"
  ON saved_searches FOR DELETE
  USING (user_id = auth.uid());

-- Migration 009: Notifications
-- Stores in-app notifications for recruiters (stage changes, client feedback,
-- outreach replies, saved search matches, placements, mentions).
-- The app server / edge function inserts rows; clients subscribe via Supabase
-- Realtime for instant delivery.

CREATE TABLE notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid        NOT NULL REFERENCES agencies(id)  ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  type        text        NOT NULL
              CHECK (type IN (
                'stage_change', 'client_feedback', 'task_due',
                'outreach_reply', 'saved_search', 'placement', 'mention'
              )),
  title       text        NOT NULL,
  body        text        NOT NULL DEFAULT '',
  href        text,                         -- deep link inside the app
  read        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX notifications_user_id_idx   ON notifications (user_id);
CREATE INDEX notifications_agency_id_idx ON notifications (agency_id);
CREATE INDEX notifications_unread_idx    ON notifications (user_id, read) WHERE read = false;

-- Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "users can delete own notifications"
  ON notifications FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "agency members can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

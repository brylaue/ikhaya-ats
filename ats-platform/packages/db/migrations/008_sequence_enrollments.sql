-- Migration 008: Sequence enrollments
-- Tracks which candidates are enrolled in which outreach sequences,
-- their current progress through the steps, and scheduled send times.
-- Each row represents one candidate ↔ sequence pairing (unique).

CREATE TABLE sequence_enrollments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id    uuid        NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  candidate_id   uuid        NOT NULL REFERENCES candidates(id)         ON DELETE CASCADE,
  agency_id      uuid        NOT NULL REFERENCES agencies(id)           ON DELETE CASCADE,
  enrolled_by    uuid        REFERENCES users(id)                       ON DELETE SET NULL,

  -- Lifecycle status
  status         text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'paused', 'completed', 'unsubscribed', 'bounced')),

  -- Step tracking: index into the sequence's steps JSONB array (email steps only)
  current_step   smallint    NOT NULL DEFAULT 0,

  -- Scheduling
  next_send_at   timestamptz,           -- null means not yet scheduled or sequence is paused
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,          -- set when status = 'completed'

  -- Engagement (updated by email provider webhook or manual override)
  emails_sent    smallint    NOT NULL DEFAULT 0,
  opened         boolean     NOT NULL DEFAULT false,
  replied        boolean     NOT NULL DEFAULT false,

  UNIQUE (sequence_id, candidate_id)
);

-- Indexes
CREATE INDEX seq_enrollments_sequence_id_idx  ON sequence_enrollments (sequence_id);
CREATE INDEX seq_enrollments_candidate_id_idx ON sequence_enrollments (candidate_id);
CREATE INDEX seq_enrollments_agency_id_idx    ON sequence_enrollments (agency_id);
CREATE INDEX seq_enrollments_next_send_idx    ON sequence_enrollments (next_send_at)
  WHERE status = 'active' AND next_send_at IS NOT NULL;

-- Row Level Security
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency members can read own enrollments"
  ON sequence_enrollments FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency members can insert enrollments"
  ON sequence_enrollments FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency members can update own enrollments"
  ON sequence_enrollments FOR UPDATE
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency members can delete own enrollments"
  ON sequence_enrollments FOR DELETE
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

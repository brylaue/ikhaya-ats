-- Migration 007: Outreach sequences
-- Stores email sequence templates with JSONB steps array.
-- Each sequence belongs to an agency; created_by tracks which recruiter authored it.

CREATE TABLE outreach_sequences (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid        NOT NULL REFERENCES agencies(id)  ON DELETE CASCADE,
  created_by  uuid        REFERENCES users(id)              ON DELETE SET NULL,
  name        text        NOT NULL,
  tag         text,
  status      text        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('active', 'paused', 'draft')),
  steps       jsonb       NOT NULL DEFAULT '[]',
  enrolled    integer     NOT NULL DEFAULT 0,
  sent        integer     NOT NULL DEFAULT 0,
  opened      integer     NOT NULL DEFAULT 0,
  replied     integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX outreach_sequences_agency_id_idx  ON outreach_sequences (agency_id);
CREATE INDEX outreach_sequences_status_idx     ON outreach_sequences (agency_id, status);
CREATE INDEX outreach_sequences_created_by_idx ON outreach_sequences (created_by);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_outreach_sequences_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER outreach_sequences_updated_at
  BEFORE UPDATE ON outreach_sequences
  FOR EACH ROW EXECUTE FUNCTION update_outreach_sequences_updated_at();

-- Row Level Security
ALTER TABLE outreach_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency members can read own sequences"
  ON outreach_sequences FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency members can insert sequences"
  ON outreach_sequences FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency members can update own sequences"
  ON outreach_sequences FOR UPDATE
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "agency members can delete own sequences"
  ON outreach_sequences FOR DELETE
  USING (
    agency_id IN (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

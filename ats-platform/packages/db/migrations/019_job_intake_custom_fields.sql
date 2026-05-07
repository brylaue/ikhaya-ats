-- Migration 015: Job intake template + custom field definitions
-- Adds structured intake data to jobs and a generic custom field system.

-- ── Job intake JSONB column ───────────────────────────────────────────────────
-- Stores the structured intake template as a JSONB blob on the jobs row.
-- Schema of the JSON object:
--   {
--     mustHaveSkills:    string[],
--     niceToHaveSkills:  string[],
--     targetCompanies:   string,
--     sourcingNotes:     string,
--     stakeholders:      { name: string; role: string; interviewStage: string }[],
--     targetStartDate:   string | null,   -- ISO date
--     latestFillDate:    string | null,   -- ISO date
--     compApproved:      boolean,
--     hiringManagerName: string,
--     hiringManagerEmail: string,
--     openReqCount:      number,
--   }

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS intake jsonb NOT NULL DEFAULT '{}';

-- ── Custom field definitions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_field_defs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  entity_type  text        NOT NULL CHECK (entity_type IN ('candidate','job','contact','company')),
  label        text        NOT NULL,
  field_type   text        NOT NULL CHECK (field_type IN ('text','number','date','select','boolean')),
  options      text[]      NOT NULL DEFAULT '{}',  -- for field_type = 'select'
  required     boolean     NOT NULL DEFAULT false,
  position     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_field_defs_agency_entity_idx
  ON custom_field_defs (agency_id, entity_type, position);

ALTER TABLE custom_field_defs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency members can read custom field defs"
  ON custom_field_defs FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "agency members can insert custom field defs"
  ON custom_field_defs FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "agency members can update custom field defs"
  ON custom_field_defs FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "agency members can delete custom field defs"
  ON custom_field_defs FOR DELETE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

-- ── Custom field values ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_field_values (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  field_def_id uuid       NOT NULL REFERENCES custom_field_defs(id) ON DELETE CASCADE,
  entity_id   uuid        NOT NULL,   -- candidate_id, job_id, etc.
  value_text  text,
  value_number numeric,
  value_date  date,
  value_bool  boolean,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_def_id, entity_id)
);

CREATE INDEX IF NOT EXISTS custom_field_values_entity_idx
  ON custom_field_values (field_def_id, entity_id);
CREATE INDEX IF NOT EXISTS custom_field_values_agency_idx
  ON custom_field_values (agency_id);

ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency members can read custom field values"
  ON custom_field_values FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "agency members can upsert custom field values"
  ON custom_field_values FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "agency members can update custom field values"
  ON custom_field_values FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_custom_field_values_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER custom_field_values_updated_at
  BEFORE UPDATE ON custom_field_values
  FOR EACH ROW EXECUTE FUNCTION update_custom_field_values_updated_at();

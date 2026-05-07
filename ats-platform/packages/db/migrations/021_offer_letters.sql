-- Migration 018: Offer Letter Templates & Approval Workflow

-- ── Offer letter templates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offer_letter_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  body        text NOT NULL,  -- Markdown/HTML with {{variable}} placeholders
  variables   jsonb NOT NULL DEFAULT '[]',
  -- variables shape: [{ key, label, defaultValue }]
  is_default  boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_offer_letter_templates_agency ON offer_letter_templates(agency_id);

-- ── Offer letters (instances) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offer_letters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES offer_letter_templates(id) ON DELETE SET NULL,
  candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id          uuid REFERENCES jobs(id) ON DELETE SET NULL,
  placement_id    uuid REFERENCES placements(id) ON DELETE SET NULL,
  -- Resolved content (template with variables substituted)
  body            text NOT NULL,
  variables       jsonb NOT NULL DEFAULT '{}',  -- { key: resolvedValue }
  -- Status workflow: draft → pending_approval → approved → sent → accepted/declined
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','pending_approval','approved','sent','accepted','declined','expired')),
  -- Approval
  approvers       jsonb NOT NULL DEFAULT '[]',
  -- approvers shape: [{ userId, status: pending|approved|rejected, decidedAt, comment }]
  approved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  rejection_reason text,
  -- Sending
  sent_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  sent_at         timestamptz,
  expires_at      timestamptz,
  -- Candidate response
  candidate_response text,
  responded_at    timestamptz,
  -- Metadata
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_offer_letters_agency      ON offer_letters(agency_id);
CREATE INDEX idx_offer_letters_candidate   ON offer_letters(candidate_id);
CREATE INDEX idx_offer_letters_job         ON offer_letters(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_offer_letters_placement   ON offer_letters(placement_id) WHERE placement_id IS NOT NULL;
CREATE INDEX idx_offer_letters_status      ON offer_letters(agency_id, status);

-- ── updated_at triggers ────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER trg_offer_templates_updated_at
    BEFORE UPDATE ON offer_letter_templates
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_offer_letters_updated_at
    BEFORE UPDATE ON offer_letters
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE offer_letter_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_letters           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency members manage offer templates"
  ON offer_letter_templates FOR ALL
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "agency members manage offer letters"
  ON offer_letters FOR ALL
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

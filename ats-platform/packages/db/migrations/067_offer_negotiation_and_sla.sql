-- ── Migration 067: Offer Negotiation & Submittal SLA (US-201, US-202, US-221) ──
--
--   US-201  Offer Negotiation & Counter-Offer Tracking
--           Tracks each round of an offer negotiation: initial offer, counter-offers,
--           revised offers, and final acceptance/rejection. Linked to the offer_letters
--           table (migration 021) so counter-offer history lives alongside the
--           approved letter.
--
--   US-202  Closing Playbook Automation
--           Per-job closing playbook: ordered checklist of actions the recruiter
--           should take when moving a candidate through final stages (reference check,
--           counter-offer coaching, start-date confirmation, etc.). Supports default
--           agency templates and job-specific overrides.
--
--   US-221  Submittal SLA per Client
--           Configurable SLA targets on the client record — how many business days
--           the recruiter should submit CVs after a req is opened, and how many
--           days the client should respond. Tracked against actual activity dates.
--
-- Idempotent: safe to re-run.

-- ── offer_rounds ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS offer_rounds (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES agencies(id)      ON DELETE CASCADE,
  offer_letter_id uuid        NOT NULL REFERENCES offer_letters(id) ON DELETE CASCADE,
  candidate_id    uuid        NOT NULL REFERENCES candidates(id)    ON DELETE CASCADE,
  job_id          uuid        NOT NULL REFERENCES jobs(id)          ON DELETE CASCADE,
  round_number    integer     NOT NULL DEFAULT 1,
  round_type      text        NOT NULL
                              CHECK (round_type IN ('initial','counter_candidate','counter_client','revised','accepted','rejected','withdrawn')),
  base_salary     numeric(12,2),
  bonus           numeric(12,2),
  equity_notes    text,
  start_date      date,
  other_terms     text,
  submitted_by    text        NOT NULL CHECK (submitted_by IN ('recruiter','candidate','client')),
  notes           text,
  created_by      uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS or_offer_letter_idx ON offer_rounds (offer_letter_id, round_number);
CREATE INDEX IF NOT EXISTS or_job_candidate_idx ON offer_rounds (job_id, candidate_id);
CREATE INDEX IF NOT EXISTS or_agency_idx ON offer_rounds (agency_id, created_at DESC);

ALTER TABLE offer_rounds ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offer_rounds' AND policyname='or_agency_select') THEN
    CREATE POLICY "or_agency_select" ON offer_rounds FOR SELECT
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offer_rounds' AND policyname='or_agency_write') THEN
    CREATE POLICY "or_agency_write" ON offer_rounds FOR ALL
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- ── closing_playbook_templates ────────────────────────────────────────────────
-- Agency-level templates. Each template has an ordered list of steps in JSONB.
-- Steps: [ { id, title, description, required, days_before_close } ]

CREATE TABLE IF NOT EXISTS closing_playbook_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  is_default  boolean     NOT NULL DEFAULT false,
  steps       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Only one default per agency
CREATE UNIQUE INDEX IF NOT EXISTS cpt_agency_default_idx
  ON closing_playbook_templates (agency_id) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS cpt_agency_idx ON closing_playbook_templates (agency_id);

ALTER TABLE closing_playbook_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='closing_playbook_templates' AND policyname='cpt_agency') THEN
    CREATE POLICY "cpt_agency" ON closing_playbook_templates FOR ALL
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION cpt_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS cpt_updated_at ON closing_playbook_templates;
CREATE TRIGGER cpt_updated_at
  BEFORE UPDATE ON closing_playbook_templates
  FOR EACH ROW EXECUTE FUNCTION cpt_touch_updated_at();

-- Seed a sensible default template per agency on first insert
-- (called from application layer, not in migration to avoid agency lookup)

-- ── closing_playbook_instances ────────────────────────────────────────────────
-- Per-job, per-candidate playbook instance with step completion tracking.

CREATE TABLE IF NOT EXISTS closing_playbook_instances (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES agencies(id)   ON DELETE CASCADE,
  job_id          uuid        NOT NULL REFERENCES jobs(id)        ON DELETE CASCADE,
  candidate_id    uuid        NOT NULL REFERENCES candidates(id)  ON DELETE CASCADE,
  template_id     uuid        REFERENCES closing_playbook_templates(id) ON DELETE SET NULL,
  steps           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- steps: [ { id, title, completed, completed_at, completed_by, note } ]
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS cpi_agency_idx ON closing_playbook_instances (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cpi_job_idx    ON closing_playbook_instances (job_id);

ALTER TABLE closing_playbook_instances ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='closing_playbook_instances' AND policyname='cpi_agency') THEN
    CREATE POLICY "cpi_agency" ON closing_playbook_instances FOR ALL
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS cpi_updated_at ON closing_playbook_instances;
CREATE TRIGGER cpi_updated_at
  BEFORE UPDATE ON closing_playbook_instances
  FOR EACH ROW EXECUTE FUNCTION cpt_touch_updated_at();

-- ── client_sla_config ─────────────────────────────────────────────────────────
-- SLA targets per client (company). All values are in business days.

CREATE TABLE IF NOT EXISTS client_sla_config (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id               uuid        NOT NULL REFERENCES agencies(id)   ON DELETE CASCADE,
  company_id              uuid        NOT NULL REFERENCES companies(id)   ON DELETE CASCADE,
  -- How many business days after req open should recruiter submit first CVs
  submittal_days          integer     NOT NULL DEFAULT 5,
  -- How many business days client should respond to a submission
  client_response_days    integer     NOT NULL DEFAULT 3,
  -- How many days from first interview to offer decision
  offer_decision_days     integer     NOT NULL DEFAULT 10,
  alert_on_breach         boolean     NOT NULL DEFAULT true,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, company_id)
);

CREATE INDEX IF NOT EXISTS csc_agency_idx   ON client_sla_config (agency_id);
CREATE INDEX IF NOT EXISTS csc_company_idx  ON client_sla_config (company_id);

ALTER TABLE client_sla_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_sla_config' AND policyname='csc_agency') THEN
    CREATE POLICY "csc_agency" ON client_sla_config FOR ALL
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS csc_updated_at ON client_sla_config;
CREATE TRIGGER csc_updated_at
  BEFORE UPDATE ON client_sla_config
  FOR EACH ROW EXECUTE FUNCTION cpt_touch_updated_at();

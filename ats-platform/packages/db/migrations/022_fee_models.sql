-- Migration 019: Fee Model Library
-- Reusable fee model templates for agency billing.

CREATE TABLE IF NOT EXISTS fee_models (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  -- Fee type
  fee_type        text NOT NULL DEFAULT 'percentage'
                  CHECK (fee_type IN ('percentage','flat','retained','container','hybrid')),
  -- Percentage-based
  percentage      numeric(5,2),     -- e.g. 25.00 for 25%
  basis           text DEFAULT 'first_year_salary'
                  CHECK (basis IN ('first_year_salary','total_comp','base_salary','package')),
  -- Flat fee
  flat_amount     numeric(12,2),
  currency        text DEFAULT 'USD',
  -- Retained / container
  retainer_amount numeric(12,2),
  retainer_schedule text,           -- e.g. "33% on start, 33% shortlist, 33% placement"
  -- Payment terms
  payment_terms   text,             -- e.g. "Net 30", "Due on placement"
  split_invoicing boolean NOT NULL DEFAULT false,
  invoice_splits  jsonb DEFAULT '[]',
  -- invoice_splits: [{ milestone, percentage, trigger }]
  -- Guarantee / replacement
  guarantee_days  integer,          -- days replacement guarantee
  replacement_terms text,
  -- Off-limits / compliance
  off_limits_months integer DEFAULT 12,
  -- Notes
  notes           text,
  is_default      boolean NOT NULL DEFAULT false,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fee_models_agency ON fee_models(agency_id);

-- ── Client-specific fee agreements (overrides library model per client/job) ───
CREATE TABLE IF NOT EXISTS fee_agreements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  fee_model_id uuid REFERENCES fee_models(id) ON DELETE SET NULL,
  company_id   uuid REFERENCES companies(id) ON DELETE CASCADE,
  job_id       uuid REFERENCES jobs(id) ON DELETE SET NULL,  -- null = applies to all jobs for client
  -- Overridden values (null = inherit from model)
  percentage   numeric(5,2),
  flat_amount  numeric(12,2),
  notes        text,
  effective_from date,
  effective_to   date,
  signed_at      timestamptz,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fee_agreements_agency   ON fee_agreements(agency_id);
CREATE INDEX idx_fee_agreements_company  ON fee_agreements(company_id);
CREATE INDEX idx_fee_agreements_job      ON fee_agreements(job_id) WHERE job_id IS NOT NULL;

-- ── updated_at triggers ────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER trg_fee_models_updated_at
    BEFORE UPDATE ON fee_models
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fee_agreements_updated_at
    BEFORE UPDATE ON fee_agreements
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE fee_models      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_agreements  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency members manage fee models"
  ON fee_models FOR ALL
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "agency members manage fee agreements"
  ON fee_agreements FOR ALL
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

-- Seed a few starter models (inserted via application code, not here)

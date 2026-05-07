-- ── Migration 068: Client Intelligence (US-156, US-157, US-158, US-159, US-481) ──
--
--   US-156  Client Health & Churn Risk Score
--           Computed score (0-100) per client based on activity signals:
--           active roles, recent placements, invoice aging, engagement
--           frequency. Stored in a table refreshed by nightly cron.
--
--   US-157  Alumni & Expansion Signals
--           Tracks placed candidates who have since changed roles or
--           companies — signals a potential re-engagement or referral opp.
--
--   US-158  BD Win/Loss Reasons & Analytics
--           Tags each BD opportunity (from bd_opportunities) with a win/loss
--           reason from a controlled vocabulary, plus free-text notes.
--
--   US-159  Client & Candidate Referral Program
--           Tracks referrals: who referred whom, the resulting candidate or
--           client, and any reward/credit issued.
--
--   US-481  Company Enrichment for BD (Firmographic Data Overlay)
--           Stores enrichment data fetched from external sources (Clearbit,
--           Apollo, manual entry) overlaid on company records for BD.
--
-- Idempotent: safe to re-run.

-- ── client_health_scores ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_health_scores (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid        NOT NULL REFERENCES agencies(id)   ON DELETE CASCADE,
  company_id          uuid        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  score               integer     NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
  risk_level          text        NOT NULL DEFAULT 'medium'
                                  CHECK (risk_level IN ('low','medium','high','critical')),
  -- Component scores (0-100 each)
  active_roles_score  integer     NOT NULL DEFAULT 50,
  placement_score     integer     NOT NULL DEFAULT 50,
  engagement_score    integer     NOT NULL DEFAULT 50,
  revenue_score       integer     NOT NULL DEFAULT 50,
  -- Signals used for computation
  active_role_count   integer     NOT NULL DEFAULT 0,
  placements_12mo     integer     NOT NULL DEFAULT 0,
  days_since_contact  integer,
  revenue_12mo        numeric(12,2) DEFAULT 0,
  last_placement_date date,
  -- Trend vs prior period
  score_delta         integer     NOT NULL DEFAULT 0,
  risk_flags          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- e.g. ["no_contact_60d", "invoice_overdue", "no_active_roles"]
  computed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, company_id)
);

CREATE INDEX IF NOT EXISTS chs_agency_risk_idx
  ON client_health_scores (agency_id, risk_level, score);

ALTER TABLE client_health_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_health_scores' AND policyname='chs_agency') THEN
    CREATE POLICY "chs_agency" ON client_health_scores FOR ALL
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- ── alumni_signals ────────────────────────────────────────────────────────────
-- Placed candidates who changed role/company since placement.

CREATE TABLE IF NOT EXISTS alumni_signals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid        NOT NULL REFERENCES agencies(id)      ON DELETE CASCADE,
  candidate_id        uuid        NOT NULL REFERENCES candidates(id)    ON DELETE CASCADE,
  placement_id        uuid        NOT NULL REFERENCES placements(id)    ON DELETE CASCADE,
  original_company_id uuid        REFERENCES companies(id)             ON DELETE SET NULL,
  original_title      text,
  new_company         text,
  new_title           text,
  new_company_id      uuid        REFERENCES companies(id)             ON DELETE SET NULL,
  signal_type         text        NOT NULL DEFAULT 'role_change'
                                  CHECK (signal_type IN ('role_change','company_change','promotion','left_company')),
  detected_at         timestamptz NOT NULL DEFAULT now(),
  actioned            boolean     NOT NULL DEFAULT false,
  actioned_at         timestamptz,
  actioned_by         uuid        REFERENCES users(id) ON DELETE SET NULL,
  action_note         text
);

CREATE INDEX IF NOT EXISTS as_agency_idx     ON alumni_signals (agency_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS as_candidate_idx  ON alumni_signals (candidate_id);

ALTER TABLE alumni_signals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='alumni_signals' AND policyname='as_agency') THEN
    CREATE POLICY "as_agency" ON alumni_signals FOR ALL
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- ── bd_win_loss_tags ──────────────────────────────────────────────────────────
-- Outcome tagging on BD opportunities (bd_opportunities table from migration 027).

CREATE TABLE IF NOT EXISTS bd_win_loss_tags (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES agencies(id)         ON DELETE CASCADE,
  opportunity_id  uuid        NOT NULL REFERENCES bd_opportunities(id) ON DELETE CASCADE,
  outcome         text        NOT NULL CHECK (outcome IN ('won','lost','no_decision','stalled')),
  reason_category text        NOT NULL
                              CHECK (reason_category IN (
                                'price','relationship','speed','quality','competition',
                                'budget_freeze','not_ready','incumbent_retained','other'
                              )),
  reason_detail   text,
  competitor      text,
  created_by      uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id)
);

CREATE INDEX IF NOT EXISTS bwlt_agency_idx  ON bd_win_loss_tags (agency_id, outcome, created_at DESC);

ALTER TABLE bd_win_loss_tags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bd_win_loss_tags' AND policyname='bwlt_agency') THEN
    CREATE POLICY "bwlt_agency" ON bd_win_loss_tags FOR ALL
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

-- ── referrals ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid        NOT NULL REFERENCES agencies(id)   ON DELETE CASCADE,
  referral_type       text        NOT NULL CHECK (referral_type IN ('candidate','client')),
  -- Who referred
  referred_by_type    text        NOT NULL CHECK (referred_by_type IN ('candidate','client','employee','other')),
  referred_by_name    text        NOT NULL,
  referred_by_candidate_id uuid   REFERENCES candidates(id) ON DELETE SET NULL,
  referred_by_company_id   uuid   REFERENCES companies(id)  ON DELETE SET NULL,
  -- Who was referred
  referred_candidate_id uuid      REFERENCES candidates(id) ON DELETE SET NULL,
  referred_company_id   uuid      REFERENCES companies(id)  ON DELETE SET NULL,
  referred_name         text,
  -- Outcome
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','contacted','converted','declined','expired')),
  converted_at        timestamptz,
  reward_description  text,
  reward_issued       boolean     NOT NULL DEFAULT false,
  reward_issued_at    timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ref_agency_idx ON referrals (agency_id, status, created_at DESC);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='referrals' AND policyname='ref_agency') THEN
    CREATE POLICY "ref_agency" ON referrals FOR ALL
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION ref_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS ref_updated_at ON referrals;
CREATE TRIGGER ref_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION ref_touch_updated_at();

-- ── company_enrichment ────────────────────────────────────────────────────────
-- US-481: Firmographic overlay for BD. One row per company.

CREATE TABLE IF NOT EXISTS company_enrichment (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid        NOT NULL REFERENCES agencies(id)   ON DELETE CASCADE,
  company_id          uuid        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  -- Firmographic data
  employee_count      integer,
  employee_range      text,       -- e.g. "50-200"
  revenue_range       text,       -- e.g. "$10M-$50M"
  funding_stage       text,       -- seed / series-a / series-b / growth / public
  funding_total_usd   bigint,
  founded_year        integer,
  industry            text,
  sub_industry        text,
  hq_city             text,
  hq_country          text,
  technologies        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- e.g. ["Salesforce", "React", "AWS"]
  linkedin_url        text,
  crunchbase_url      text,
  source              text        NOT NULL DEFAULT 'manual'
                                  CHECK (source IN ('manual','clearbit','apollo','hunter','other')),
  source_fetched_at   timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, company_id)
);

CREATE INDEX IF NOT EXISTS ce_agency_idx   ON company_enrichment (agency_id);
CREATE INDEX IF NOT EXISTS ce_company_idx  ON company_enrichment (company_id);

ALTER TABLE company_enrichment ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='company_enrichment' AND policyname='ce_agency') THEN
    CREATE POLICY "ce_agency" ON company_enrichment FOR ALL
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()))
      WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS ce_updated_at ON company_enrichment;
CREATE TRIGGER ce_updated_at
  BEFORE UPDATE ON company_enrichment
  FOR EACH ROW EXECUTE FUNCTION ref_touch_updated_at();

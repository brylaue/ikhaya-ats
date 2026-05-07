-- Migration 022: Business Development Pipeline (US-150)
-- Tracks prospect companies through BD stages before they become active clients.

-- BD Stage definitions (per agency, customizable)
CREATE TABLE IF NOT EXISTS bd_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  color       text NOT NULL DEFAULT '#94a3b8',
  is_won      boolean NOT NULL DEFAULT false,
  is_lost     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (agency_id, name)
);

CREATE INDEX IF NOT EXISTS idx_bd_stages_agency ON bd_stages(agency_id);

-- BD Opportunities — one row per prospect/deal
CREATE TABLE IF NOT EXISTS bd_opportunities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  -- May link to an existing company or be a net-new prospect
  company_id      uuid REFERENCES companies(id) ON DELETE SET NULL,
  company_name    text NOT NULL,     -- denormalized for display even before company record exists
  contact_name    text,
  contact_title   text,
  contact_email   text,
  contact_linkedin text,
  stage_id        uuid NOT NULL REFERENCES bd_stages(id) ON DELETE RESTRICT,
  owner_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  estimated_value numeric(14, 2),   -- estimated annual fee value
  probability     integer CHECK (probability BETWEEN 0 AND 100),
  next_action     text,
  next_action_at  timestamptz,
  notes           text,
  source          text,             -- e.g. referral, outbound, inbound, conference
  priority        text NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high','urgent')),
  entered_stage_at timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz,
  won_at          timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bd_opps_agency    ON bd_opportunities(agency_id);
CREATE INDEX IF NOT EXISTS idx_bd_opps_stage     ON bd_opportunities(stage_id);
CREATE INDEX IF NOT EXISTS idx_bd_opps_owner     ON bd_opportunities(owner_id);
CREATE INDEX IF NOT EXISTS idx_bd_opps_company   ON bd_opportunities(company_id);

-- Activities / notes on BD opportunities
CREATE TABLE IF NOT EXISTS bd_activities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES bd_opportunities(id) ON DELETE CASCADE,
  agency_id      uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  type           text NOT NULL CHECK (type IN ('note','call','email','meeting','linkedin','other')),
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bd_activities_opp ON bd_activities(opportunity_id);

-- Trigger: keep updated_at current on bd_opportunities
DO $$ BEGIN
  CREATE TRIGGER bd_opps_updated_at
    BEFORE UPDATE ON bd_opportunities
    FOR EACH ROW EXECUTE PROCEDURE touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Seed default BD stages ────────────────────────────────────────────────────
-- These are created per-agency via application logic. The schema is ready.

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE bd_stages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_activities   ENABLE ROW LEVEL SECURITY;

-- bd_stages
CREATE POLICY "bd_stages_select" ON bd_stages FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "bd_stages_insert" ON bd_stages FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "bd_stages_update" ON bd_stages FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "bd_stages_delete" ON bd_stages FOR DELETE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

-- bd_opportunities
CREATE POLICY "bd_opps_select" ON bd_opportunities FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "bd_opps_insert" ON bd_opportunities FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "bd_opps_update" ON bd_opportunities FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "bd_opps_delete" ON bd_opportunities FOR DELETE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

-- bd_activities
CREATE POLICY "bd_activities_select" ON bd_activities FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "bd_activities_insert" ON bd_activities FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "bd_activities_delete" ON bd_activities FOR DELETE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

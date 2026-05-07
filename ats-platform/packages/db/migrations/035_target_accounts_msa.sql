-- Migration 027: Target Account Lists + MSA Lifecycle (US-154, US-155)

-- ── Target Account Lists (US-154) ─────────────────────────────────────────────
-- Marks companies as target accounts for ABM-style BD focus.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS is_target_account  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_priority     text
    CHECK (target_priority IN ('tier1','tier2','tier3')),
  ADD COLUMN IF NOT EXISTS target_account_note text,
  ADD COLUMN IF NOT EXISTS target_added_at     timestamptz;

-- Track which accounts are in a named list (optional grouping)
CREATE TABLE IF NOT EXISTS target_account_lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  color       text DEFAULT '#5461f5',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, name)
);

CREATE TABLE IF NOT EXISTS target_account_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     uuid NOT NULL REFERENCES target_account_lists(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_tal_agency   ON target_account_lists(agency_id);
CREATE INDEX IF NOT EXISTS idx_tam_list     ON target_account_memberships(list_id);
CREATE INDEX IF NOT EXISTS idx_tam_company  ON target_account_memberships(company_id);

DO $$ BEGIN
  CREATE TRIGGER target_lists_updated_at
    BEFORE UPDATE ON target_account_lists
    FOR EACH ROW EXECUTE PROCEDURE touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE target_account_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE target_account_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tal_select" ON target_account_lists FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tal_insert" ON target_account_lists FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tal_update" ON target_account_lists FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tal_delete" ON target_account_lists FOR DELETE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "tam_select" ON target_account_memberships FOR SELECT
  USING (list_id IN (SELECT id FROM target_account_lists WHERE agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())));
CREATE POLICY "tam_insert" ON target_account_memberships FOR INSERT
  WITH CHECK (list_id IN (SELECT id FROM target_account_lists WHERE agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())));
CREATE POLICY "tam_delete" ON target_account_memberships FOR DELETE
  USING (list_id IN (SELECT id FROM target_account_lists WHERE agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())));

-- ── MSA Lifecycle (US-155) ────────────────────────────────────────────────────
-- Tracks master service agreements per client company.

CREATE TABLE IF NOT EXISTS client_msas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title            text NOT NULL DEFAULT 'Master Service Agreement',
  signed_at        date,
  effective_date   date,
  expiry_date      date,
  auto_renews      boolean NOT NULL DEFAULT false,
  renewal_notice_days integer DEFAULT 60,   -- days before expiry to alert
  status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('draft','active','expired','terminated','renewed')),
  fee_cap          numeric(14,2),           -- max fee per hire if applicable
  exclusivity      text,                    -- 'exclusive','non-exclusive','partial'
  notes            text,
  document_url     text,                    -- link to signed PDF in storage
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msas_agency   ON client_msas(agency_id);
CREATE INDEX IF NOT EXISTS idx_msas_company  ON client_msas(company_id);
CREATE INDEX IF NOT EXISTS idx_msas_expiry   ON client_msas(expiry_date) WHERE status = 'active';

DO $$ BEGIN
  CREATE TRIGGER msas_updated_at
    BEFORE UPDATE ON client_msas
    FOR EACH ROW EXECUTE PROCEDURE touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE client_msas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "msas_select" ON client_msas FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "msas_insert" ON client_msas FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "msas_update" ON client_msas FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "msas_delete" ON client_msas FOR DELETE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

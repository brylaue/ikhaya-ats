-- ─── Migration 075: Super-admin Tenant Panels + A/B Experiments ─────────────
-- US-463 — cost attribution: storage/seat/AI breakdown per tenant
-- US-464 — integration inventory + sync health (extend agency_connectors)
-- US-465 — composite tenant health score snapshots
-- US-466 — billing panel relies on existing agencies+billing_events
-- US-467 — support ticket linkage
-- US-511 — A/B testing / percentage-rollout infrastructure
--
-- All super-admin tables: no RLS — read via service-role from /super-admin/*.

-- ── US-464: connector sync health ───────────────────────────────────────────
ALTER TABLE agency_connectors
  ADD COLUMN IF NOT EXISTS last_sync_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_status  TEXT
    CHECK (last_sync_status IN ('ok', 'warning', 'error', 'never')) DEFAULT 'never',
  ADD COLUMN IF NOT EXISTS last_error        TEXT,
  ADD COLUMN IF NOT EXISTS error_count_7d    INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ac_sync_status_idx ON agency_connectors (last_sync_status)
  WHERE last_sync_status IN ('warning', 'error');

COMMENT ON COLUMN agency_connectors.last_sync_status IS
  'US-464: Used by /super-admin/integrations to flag tenants with broken connectors.';

-- ── US-465: tenant health snapshots ─────────────────────────────────────────
-- Composite health computed nightly. Keeping snapshots lets us draw a trend.
CREATE TABLE IF NOT EXISTS tenant_health_snapshots (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           UUID         NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  computed_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Sub-scores (0-100, higher better)
  activity_score      INTEGER      NOT NULL,   -- recent logins, jobs created, placements
  adoption_score      INTEGER      NOT NULL,   -- % of plan features actually used
  reliability_score   INTEGER      NOT NULL,   -- inverse of error count (AI errors, sync errors)
  payment_score       INTEGER      NOT NULL,   -- subscription status (active=100, past_due=40, ...)
  -- Composite (weighted mean of the four)
  overall_score       INTEGER      NOT NULL,
  -- Auto-derived risk band
  risk_band           TEXT         NOT NULL CHECK (risk_band IN ('healthy','watch','at_risk','critical')),
  detail              JSONB        DEFAULT '{}'  -- raw inputs for the calculation
);

CREATE INDEX IF NOT EXISTS ths_agency_recent_idx
  ON tenant_health_snapshots (agency_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS ths_band_idx
  ON tenant_health_snapshots (risk_band, computed_at DESC)
  WHERE risk_band IN ('at_risk', 'critical');

COMMENT ON TABLE tenant_health_snapshots IS
  'US-465: Nightly composite health score per tenant. Latest row per agency '
  'feeds /super-admin/health; older rows used for trend sparklines.';

-- ── US-467: support ticket linkage ──────────────────────────────────────────
-- Light-weight ticket store. Real CS tools (Zendesk/Intercom/Linear) sync in
-- via webhook → upsert here. Super admin reads this for tenant-level view.
CREATE TABLE IF NOT EXISTS support_tickets (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           UUID         NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  external_id         TEXT,        -- Zendesk/Intercom/Linear ticket key
  external_source     TEXT         CHECK (external_source IN ('zendesk','intercom','linear','manual')),
  external_url        TEXT,
  subject             TEXT         NOT NULL,
  status              TEXT         NOT NULL CHECK (status IN ('open','pending','solved','closed')),
  priority            TEXT         CHECK (priority IN ('low','normal','high','urgent')),
  requester_email     TEXT,
  assignee_email      TEXT,
  opened_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  closed_at           TIMESTAMPTZ,
  detail              JSONB        DEFAULT '{}',
  UNIQUE (external_source, external_id)  -- idempotent webhook upsert
);

CREATE INDEX IF NOT EXISTS st_agency_open_idx
  ON support_tickets (agency_id, opened_at DESC)
  WHERE status IN ('open','pending');
CREATE INDEX IF NOT EXISTS st_status_idx ON support_tickets (status);

COMMENT ON TABLE support_tickets IS
  'US-467: Per-tenant support tickets, sourced from external tools via webhook. '
  'Surfaced on /super-admin/support and the tenant detail page.';

-- ── US-463: storage usage rollup ────────────────────────────────────────────
-- Computed nightly from supabase storage metadata. Keeping a rolling history
-- lets cost attribution show trend.
CREATE TABLE IF NOT EXISTS tenant_storage_snapshots (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           UUID         NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  snapshot_date       DATE         NOT NULL,
  resume_bytes        BIGINT       NOT NULL DEFAULT 0,
  attachment_bytes    BIGINT       NOT NULL DEFAULT 0,
  branded_doc_bytes   BIGINT       NOT NULL DEFAULT 0,
  other_bytes         BIGINT       NOT NULL DEFAULT 0,
  total_bytes         BIGINT       GENERATED ALWAYS AS
    (resume_bytes + attachment_bytes + branded_doc_bytes + other_bytes) STORED,
  UNIQUE (agency_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS tss_agency_date_idx
  ON tenant_storage_snapshots (agency_id, snapshot_date DESC);

COMMENT ON TABLE tenant_storage_snapshots IS
  'US-463: Daily storage breakdown per tenant. Cost attribution uses latest row.';

-- ── US-511: A/B testing / percentage-rollout infrastructure ─────────────────
CREATE TABLE IF NOT EXISTS experiments (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 TEXT         NOT NULL UNIQUE,         -- e.g. 'new_kanban_layout'
  name                TEXT         NOT NULL,
  description         TEXT,
  -- Variants are JSON: [{ "key": "control", "weight": 50 }, { "key": "treatment", "weight": 50 }]
  variants            JSONB        NOT NULL,
  -- Targeting: optional plan list, agency allow/deny, percentage
  rollout_pct         INTEGER      NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  target_plans        TEXT[]       DEFAULT NULL,            -- NULL = all plans
  agency_allowlist    UUID[]       DEFAULT NULL,            -- NULL = no allowlist
  agency_denylist     UUID[]       DEFAULT NULL,
  status              TEXT         NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed')),
  created_by          UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS experiments_status_idx ON experiments (status);

CREATE TABLE IF NOT EXISTS experiment_assignments (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id       UUID         NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  -- Assignment is per (agency, user) so cross-device experience is consistent.
  agency_id           UUID         NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id             UUID         REFERENCES users(id) ON DELETE CASCADE,
  variant_key         TEXT         NOT NULL,
  assigned_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, agency_id, user_id)
);

CREATE INDEX IF NOT EXISTS ea_lookup_idx
  ON experiment_assignments (experiment_id, agency_id, user_id);

COMMENT ON TABLE experiments IS
  'US-511: A/B test / percentage-rollout definitions. Resolved at runtime via '
  'experiments_lib.ts → useExperiment(key) hook.';

COMMENT ON TABLE experiment_assignments IS
  'US-511: Sticky variant assignment per (experiment, agency, user). '
  'Lookup by hash on first request; persisted so the same user always sees the '
  'same variant.';

-- ── Convenience view: latest health snapshot per tenant ─────────────────────
CREATE OR REPLACE VIEW tenant_health_latest AS
SELECT DISTINCT ON (agency_id) *
FROM tenant_health_snapshots
ORDER BY agency_id, computed_at DESC;

COMMENT ON VIEW tenant_health_latest IS
  'US-465: convenience — latest health row per agency.';

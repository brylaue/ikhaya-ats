-- ─── Migration 073: Product Feature Tables ────────────────────────────────────
-- US-014: Relationship Graph (uses existing tables, no new schema needed)
-- US-069: Custom Report Builder
-- US-117: Rediscovery Recommendations
-- US-440: MCP Server (OAuth clients for MCP access)
-- US-443: Integration Marketplace connector registry
-- US-462: Tenant provisioning audit log

-- ─── US-069: Custom Report Builder ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  name            TEXT        NOT NULL,
  description     TEXT,

  -- Report definition stored as JSONB canvas spec
  -- { entities: string[], dimensions: Dimension[], metrics: Metric[], filters: Filter[], pivots: Pivot[] }
  definition      JSONB       NOT NULL DEFAULT '{}',

  -- Schedule for email delivery
  schedule_cron   TEXT,
  schedule_emails TEXT[]      DEFAULT '{}',

  is_public       BOOLEAN     NOT NULL DEFAULT FALSE,  -- share with team
  last_run_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cr_agency_idx ON custom_reports (agency_id, created_at DESC);
ALTER TABLE custom_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_reports_agency_own" ON custom_reports FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE TRIGGER custom_reports_updated_at
  BEFORE UPDATE ON custom_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── US-440/442: MCP OAuth Clients ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  name            TEXT        NOT NULL,
  client_id       TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  client_secret   TEXT        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Allowed scopes: candidates:read, candidates:write, jobs:read, jobs:write, pipeline:write
  allowed_scopes  TEXT[]      NOT NULL DEFAULT '{"candidates:read","jobs:read"}',

  -- Registered redirect URIs
  redirect_uris   TEXT[]      NOT NULL DEFAULT '{}',

  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  last_used_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mco_agency_idx     ON mcp_oauth_clients (agency_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS mco_client_id_idx  ON mcp_oauth_clients (client_id);
ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mco_agency_admin" ON mcp_oauth_clients FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE TRIGGER mcp_oauth_clients_updated_at
  BEFORE UPDATE ON mcp_oauth_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── US-443: Integration Marketplace — enabled connectors per agency ──────────

CREATE TABLE IF NOT EXISTS agency_connectors (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  connector_key   TEXT        NOT NULL,  -- e.g. 'broadbean', 'docusign', 'gong'
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  config          JSONB       DEFAULT '{}',
  enabled_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  enabled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at     TIMESTAMPTZ,
  UNIQUE (agency_id, connector_key)
);

CREATE INDEX IF NOT EXISTS ac_agency_idx ON agency_connectors (agency_id) WHERE enabled = TRUE;
ALTER TABLE agency_connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ac_agency_admin" ON agency_connectors FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

-- ─── US-462: Tenant Provisioning Audit ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_provision_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_agency_id UUID       REFERENCES agencies(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL CHECK (action IN (
    'create_org', 'reset_password', 'change_plan', 'archive_org',
    'restore_org', 'trigger_welcome_email', 'adjust_seats'
  )),
  performed_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  payload         JSONB       DEFAULT '{}',
  result          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tpe_agency_idx ON tenant_provision_events (target_agency_id, created_at DESC);
-- Super admin only — no RLS, secured at API layer with super_admin role check

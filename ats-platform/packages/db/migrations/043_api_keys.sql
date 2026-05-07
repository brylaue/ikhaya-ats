-- Migration 035: Service Accounts & Scoped API Keys (US-401)
-- Long-lived API keys for machine-to-machine integrations.
-- Key material is hashed (SHA-256) — plain text shown only once at creation.

CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES auth.users(id),
  name            TEXT        NOT NULL,                -- human label e.g. "Zapier integration"
  key_prefix      TEXT        NOT NULL,                -- first 8 chars e.g. "ik_live_" for display
  key_hash        TEXT        NOT NULL UNIQUE,         -- SHA-256(full key), used for lookup
  scopes          TEXT[]      NOT NULL DEFAULT '{}',   -- e.g. {"candidates:read","placements:write"}
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,                         -- null = non-expiring
  revoked_at      TIMESTAMPTZ,
  revoke_reason   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_agency_idx ON api_keys (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx   ON api_keys (key_hash) WHERE revoked_at IS NULL;

-- Allowed scopes enum (validated in application layer)
-- Scopes:  candidates:read, candidates:write
--          jobs:read, jobs:write
--          placements:read, placements:write
--          clients:read, clients:write
--          applications:read, applications:write
--          webhooks:read, webhooks:write
--          analytics:read

-- RLS: owners and admins can manage keys for their agency
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_agency_read" ON api_keys
  FOR SELECT USING (
    agency_id = (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "api_keys_agency_write" ON api_keys
  FOR ALL USING (
    agency_id = (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    agency_id = (
      SELECT agency_id FROM users WHERE id = auth.uid()
    )
  );

-- Per-key audit events join
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id);

-- ─── Migration 074: Security fixes + server-side tier enforcement ────────────
--
-- Supports these stories shipped in pass 17:
--
--   US-496  Fix broken @/lib/agency imports (callsite repair, no schema)
--   US-497  MCP scope enforcement
--   US-498  MCP Bearer token auth  → NEW table mcp_access_tokens
--   US-499  Plan-tier gating on AI routes (code-only)
--   US-500  jd-generate / weekly-status cost-tracker wiring (code-only)
--   US-501  weekly-status IDOR (code-only)
--   US-502  Prompt-injection sanitizer (code-only)
--   US-503  CSRF on AI routes (code-only)
--   US-504  JSON.parse crash hardening (code-only)
--   US-505  pay-transparency agency filter (code-only)
--   US-506  payouts export row cap (code-only)
--   US-507  payouts float recalc fix (code-only)
--   US-508  resume-parse MIME guard (code-only)
--   US-509  cost-tracker fail-closed (code-only)
--   US-510  weekly-status Promise.all error handling (code-only)
--   US-512  requirePlan() middleware (code-only)
--   US-513  FeatureGate on Pro pages (code-only)
--   US-514  feature-flags additions (code-only)
--
-- Only US-498 needs a schema change. Everything else is handled in app code.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── US-498: MCP Bearer token auth ────────────────────────────────────────────
--
-- `mcp_oauth_clients` already exists (see 073) but holds long-lived client
-- credentials (client_id + client_secret), not per-session access tokens.
-- OAuth 2.1 issues short-lived access tokens that expire and can be revoked
-- independently of the client registration. We model those here.
--
-- Tokens are hashed on the way in (sha256, base64url) so a DB leak does not
-- expose usable Bearer values. The plaintext is returned exactly once at the
-- /oauth/token exchange endpoint and never stored.
--
-- `scopes` snapshots the granted subset at issue time — if the client row is
-- later expanded to include more scopes, already-issued tokens remain bounded
-- to what was granted when they were minted.

CREATE TABLE IF NOT EXISTS mcp_access_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
  agency_id       UUID        NOT NULL REFERENCES agencies(id)          ON DELETE CASCADE,
  user_id         UUID                 REFERENCES auth.users(id)        ON DELETE SET NULL,

  token_hash      TEXT        NOT NULL UNIQUE,   -- sha256(base64url(access_token))
  scopes          TEXT[]      NOT NULL DEFAULT '{}',

  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mat_token_hash_idx ON mcp_access_tokens (token_hash)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS mat_agency_idx     ON mcp_access_tokens (agency_id);
CREATE INDEX IF NOT EXISTS mat_expiry_idx     ON mcp_access_tokens (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE mcp_access_tokens ENABLE ROW LEVEL SECURITY;

-- Admin-only read (nothing should read raw tokens besides the server via
-- service role). Policy is defensive — the server uses service role for the
-- lookup in /api/mcp.
CREATE POLICY "mat_agency_admin" ON mcp_access_tokens FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

-- Add `last_used_at` on mcp_oauth_clients is already present in 073; nothing
-- else to touch there.

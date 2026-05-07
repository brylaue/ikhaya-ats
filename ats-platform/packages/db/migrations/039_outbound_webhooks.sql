-- Migration: 031_outbound_webhooks
-- US-083: Outbound webhook infrastructure — signed, replay-protected delivery
--         with exponential backoff retries and a 24h dead-letter queue.

-- ─── webhook_endpoints ────────────────────────────────────────────────────────
-- One row per endpoint the agency has configured.

CREATE TABLE webhook_endpoints (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         UUID         NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  url               TEXT         NOT NULL,
  description       TEXT,
  secret            TEXT         NOT NULL,            -- HMAC-SHA256 signing secret (stored encrypted)
  secret_version    INTEGER      NOT NULL DEFAULT 1,  -- incremented on rotation
  events            TEXT[]       NOT NULL DEFAULT '{}', -- event types to subscribe to (empty = all)
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by        UUID         REFERENCES users(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX webhook_endpoints_agency_idx ON webhook_endpoints(agency_id);

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_endpoints_agency ON webhook_endpoints
  USING (agency_id = current_agency_id());

CREATE TRIGGER trg_webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── webhook_deliveries ────────────────────────────────────────────────────────
-- Immutable log of every delivery attempt. Never deleted (audit trail).

CREATE TYPE webhook_delivery_status AS ENUM (
  'pending',        -- queued, not yet attempted
  'success',        -- HTTP 2xx received within timeout
  'failed',         -- non-2xx or timeout
  'dead_lettered'   -- exhausted retries after 24h; moved to DLQ
);

CREATE TABLE webhook_deliveries (
  id                UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         UUID                    NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  endpoint_id       UUID                    NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type        TEXT                    NOT NULL,
  payload           JSONB                   NOT NULL,
  nonce             TEXT                    NOT NULL,   -- UUID v4, for replay protection
  signature         TEXT                    NOT NULL,   -- HMAC-SHA256 hex
  status            webhook_delivery_status NOT NULL DEFAULT 'pending',
  attempt_count     INTEGER                 NOT NULL DEFAULT 0,
  next_retry_at     TIMESTAMPTZ,
  last_response_status INTEGER,
  last_response_body TEXT,
  first_attempted_at TIMESTAMPTZ,
  last_attempted_at  TIMESTAMPTZ,
  dead_lettered_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ             NOT NULL DEFAULT now()
);

CREATE INDEX webhook_deliveries_endpoint_idx  ON webhook_deliveries(endpoint_id);
CREATE INDEX webhook_deliveries_agency_idx    ON webhook_deliveries(agency_id);
CREATE INDEX webhook_deliveries_retry_idx     ON webhook_deliveries(next_retry_at)
  WHERE status = 'pending' AND next_retry_at IS NOT NULL;
CREATE INDEX webhook_deliveries_status_idx    ON webhook_deliveries(status, created_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_agency ON webhook_deliveries
  USING (agency_id = current_agency_id());

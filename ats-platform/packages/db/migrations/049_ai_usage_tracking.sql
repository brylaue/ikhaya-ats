-- Migration: 049_ai_usage_tracking
-- US-377: Track per-agency LLM + embedding API spend so we can (1) cap runaway
-- costs per agency per day, (2) alert on platform-wide spikes, and (3) show
-- real usage numbers in the super-admin usage page.
--
-- Two tables:
--   ai_usage_events   — append-only raw log, one row per API call.
--   ai_usage_daily    — materialized daily rollup per (agency, provider,
--                       model). The rate-limit check reads from this table
--                       to avoid a COUNT(*) against ai_usage_events on
--                       every AI call.
--
-- Cost estimates live in application code (lib/ai/cost-tracker.ts) because
-- provider prices change far more often than schemas.

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             UUID          REFERENCES agencies(id) ON DELETE SET NULL,
  user_id               UUID          REFERENCES users(id)    ON DELETE SET NULL,
  provider              TEXT          NOT NULL,   -- 'anthropic' | 'openai'
  model                 TEXT          NOT NULL,   -- e.g. 'claude-sonnet-4-6', 'text-embedding-3-small'
  operation             TEXT          NOT NULL,   -- semantic label: 'resume_parse', 'embed_candidate', 'boolean_search', ...
  input_tokens          INTEGER       NOT NULL DEFAULT 0,
  output_tokens         INTEGER       NOT NULL DEFAULT 0,
  estimated_cost_usd    NUMERIC(10,6) NOT NULL DEFAULT 0,
  latency_ms            INTEGER,
  error                 TEXT,
  occurred_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_agency_time_idx
  ON ai_usage_events (agency_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_time_idx
  ON ai_usage_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_operation_idx
  ON ai_usage_events (operation);

-- Daily rollup. A single row per (agency, provider, model, day). Updated on
-- every event via trigger; the rate-limit path reads this table only.
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  agency_id             UUID          NOT NULL,
  provider              TEXT          NOT NULL,
  model                 TEXT          NOT NULL,
  day                   DATE          NOT NULL,
  call_count            INTEGER       NOT NULL DEFAULT 0,
  input_tokens          BIGINT        NOT NULL DEFAULT 0,
  output_tokens         BIGINT        NOT NULL DEFAULT 0,
  total_cost_usd        NUMERIC(12,6) NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agency_id, provider, model, day)
);

CREATE INDEX IF NOT EXISTS ai_usage_daily_agency_day_idx
  ON ai_usage_daily (agency_id, day DESC);

-- ─── Rollup trigger ────────────────────────────────────────────────────────
-- Every insert into ai_usage_events bumps the (agency, provider, model, day)
-- row in ai_usage_daily. Uses INSERT ... ON CONFLICT ... DO UPDATE.
CREATE OR REPLACE FUNCTION roll_up_ai_usage() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agency_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO ai_usage_daily (
    agency_id, provider, model, day,
    call_count, input_tokens, output_tokens, total_cost_usd, updated_at
  ) VALUES (
    NEW.agency_id, NEW.provider, NEW.model, DATE(NEW.occurred_at),
    1, NEW.input_tokens, NEW.output_tokens, NEW.estimated_cost_usd, NOW()
  )
  ON CONFLICT (agency_id, provider, model, day) DO UPDATE SET
    call_count     = ai_usage_daily.call_count     + 1,
    input_tokens   = ai_usage_daily.input_tokens   + EXCLUDED.input_tokens,
    output_tokens  = ai_usage_daily.output_tokens  + EXCLUDED.output_tokens,
    total_cost_usd = ai_usage_daily.total_cost_usd + EXCLUDED.total_cost_usd,
    updated_at     = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roll_up_ai_usage ON ai_usage_events;
CREATE TRIGGER trg_roll_up_ai_usage
  AFTER INSERT ON ai_usage_events
  FOR EACH ROW EXECUTE FUNCTION roll_up_ai_usage();

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Agency users can SELECT their own rows (read-only dashboards). Writes go
-- through the service-role key from the cost tracker helper.
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_daily  ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_events_select_own ON ai_usage_events
  FOR SELECT USING (agency_id = current_agency_id());

CREATE POLICY ai_usage_daily_select_own ON ai_usage_daily
  FOR SELECT USING (agency_id = current_agency_id());

COMMENT ON TABLE  ai_usage_events IS 'US-377: append-only log of LLM/embedding API calls for cost tracking.';
COMMENT ON TABLE  ai_usage_daily  IS 'US-377: daily rollup driving rate limits + usage dashboards.';

-- Stage 10: email sync metrics table + error_state column
-- Forward-only migration

-- Metrics emission table — one row per snapshot (daily or per-sync)
CREATE TABLE IF NOT EXISTS metrics_email_sync (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id   uuid NOT NULL REFERENCES agencies(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  period      varchar(20) NOT NULL DEFAULT 'daily',  -- 'daily' | 'per_sync'

  -- Counters
  connection_count_google    int NOT NULL DEFAULT 0,
  connection_count_microsoft int NOT NULL DEFAULT 0,
  messages_synced_total      int NOT NULL DEFAULT 0,
  match_precision_rate       numeric(5,4),  -- matches/messages
  activation_rate            numeric(5,4),  -- users_with_connection / total_users
  freshness_p50_seconds      int,           -- median seconds since last sync

  -- Error tracking
  error_count                int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_metrics_email_sync_agency
  ON metrics_email_sync(agency_id, recorded_at DESC);

-- Add error_state column to provider_connections if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'provider_connections' AND column_name = 'error_state'
  ) THEN
    ALTER TABLE provider_connections ADD COLUMN error_state varchar(50);
  END IF;
END $$;

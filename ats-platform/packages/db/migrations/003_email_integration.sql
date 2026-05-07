-- ============================================================
-- Migration 003: Email Integration Schema
-- PostgreSQL 17 / Supabase
--
-- Tables:
--   provider_connections       — user ↔ provider OAuth connection
--   ikhaya_tenant_ms_tenants   — MS admin-consent tracking per agency
--   email_threads              — provider thread aggregates
--   email_messages             — individual messages (body in S3/R2)
--   candidate_email_links      — matched message → candidate
--   sync_events                — append-only observability log
--
-- Extensions: citext (case-insensitive text; pg_trgm already installed)
-- RLS:  all six tables — agency-isolated via current_agency_id()
--       (matches pattern used in all existing migrations)
-- ============================================================

-- ─── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "citext";

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE email_provider  AS ENUM ('google', 'microsoft');
CREATE TYPE email_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE match_strategy  AS ENUM ('exact', 'alt', 'thread', 'fuzzy');
CREATE TYPE match_status    AS ENUM ('active', 'pending_review', 'rejected');

-- ─── provider_connections ─────────────────────────────────────────────────────
-- One row per (user × provider). Refresh token is NEVER stored here;
-- only the Vault secret reference is kept.

CREATE TABLE provider_connections (
  id                        UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID           NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  agency_id                 UUID           NOT NULL REFERENCES agencies(id)  ON DELETE CASCADE,
  provider                  email_provider NOT NULL,
  provider_sub              TEXT           NOT NULL,                -- stable user-id at provider
  email                     CITEXT         NOT NULL,
  ms_tenant_id              UUID,                                   -- NULL for Google connections
  refresh_token_secret_ref  TEXT           NOT NULL,                -- Vault secret reference
  access_token_expires_at   TIMESTAMPTZ    NOT NULL,
  scopes                    TEXT[]         NOT NULL DEFAULT '{}',
  realtime_subscription_id  TEXT,
  realtime_expires_at       TIMESTAMPTZ,
  delta_cursor              TEXT,                                   -- historyId (Google) or deltaLink (MS)
  sync_enabled              BOOLEAN        NOT NULL DEFAULT TRUE,
  backfill_completed_at     TIMESTAMPTZ,
  created_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE INDEX provider_connections_user_id_idx   ON provider_connections(user_id);
CREATE INDEX provider_connections_agency_id_idx ON provider_connections(agency_id);

CREATE TRIGGER trg_provider_connections_updated_at
  BEFORE UPDATE ON provider_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ikhaya_tenant_ms_tenants ─────────────────────────────────────────────────
-- Tracks Microsoft 365 admin-consent status for tenant-wide auth flows.
-- One row per (Ikhaya agency × MS tenant); created during the /adminconsent callback.

CREATE TABLE ikhaya_tenant_ms_tenants (
  ikhaya_agency_id          UUID    NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  ms_tenant_id              UUID    NOT NULL,
  admin_consented           BOOLEAN NOT NULL DEFAULT FALSE,
  admin_consented_at        TIMESTAMPTZ,
  admin_consented_by_email  CITEXT,
  PRIMARY KEY (ikhaya_agency_id, ms_tenant_id)
);

CREATE INDEX ikhaya_tenant_ms_tenants_agency_id_idx ON ikhaya_tenant_ms_tenants(ikhaya_agency_id);

-- ─── email_threads ────────────────────────────────────────────────────────────
-- One row per provider thread. Aggregates participant count and time range
-- so the timeline UI can render a thread summary without loading all messages.

CREATE TABLE email_threads (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID           NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  agency_id           UUID           NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider            email_provider NOT NULL,
  provider_thread_id  TEXT           NOT NULL,
  subject             TEXT,
  participant_count   INT            NOT NULL DEFAULT 0,
  first_msg_at        TIMESTAMPTZ,
  last_msg_at         TIMESTAMPTZ,
  UNIQUE (user_id, provider, provider_thread_id)
);

CREATE INDEX email_threads_user_id_idx     ON email_threads(user_id);
CREATE INDEX email_threads_agency_id_idx   ON email_threads(agency_id);
CREATE INDEX email_threads_last_msg_at_idx ON email_threads(last_msg_at DESC);

-- ─── email_messages ───────────────────────────────────────────────────────────
-- One row per message. HTML and plain-text bodies are stored in S3/R2;
-- only metadata, participant addresses, and a snippet are kept here.
-- Addresses use CITEXT so comparisons are always case-insensitive.

CREATE TABLE email_messages (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id             UUID            NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  user_id               UUID            NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  agency_id             UUID            NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider              email_provider  NOT NULL,
  provider_message_id   TEXT            NOT NULL,
  internet_message_id   TEXT,                                     -- RFC 822 Message-ID header
  sent_at               TIMESTAMPTZ     NOT NULL,
  direction             email_direction NOT NULL,
  from_addr             CITEXT          NOT NULL,
  to_addrs              CITEXT[]        NOT NULL DEFAULT '{}',
  cc_addrs              CITEXT[]        NOT NULL DEFAULT '{}',
  bcc_addrs             CITEXT[]        NOT NULL DEFAULT '{}',
  subject               TEXT,
  snippet               TEXT,
  body_html_s3_key      TEXT,
  body_text_s3_key      TEXT,
  labels_or_categories  TEXT[]          NOT NULL DEFAULT '{}',
  raw_headers_s3_key    TEXT,
  UNIQUE (user_id, provider, provider_message_id)
);

CREATE INDEX email_messages_user_id_idx         ON email_messages(user_id);
CREATE INDEX email_messages_agency_id_idx       ON email_messages(agency_id);
CREATE INDEX email_messages_thread_id_idx       ON email_messages(thread_id);
CREATE INDEX email_messages_sent_at_idx         ON email_messages(sent_at DESC);
CREATE INDEX email_messages_internet_msg_id_idx ON email_messages(internet_message_id)
  WHERE internet_message_id IS NOT NULL;

-- Trigram GIN index for in-app subject + snippet search (matches pattern from migration 002)
CREATE INDEX email_messages_subject_snippet_trgm_idx ON email_messages
  USING gin ((coalesce(subject, '') || ' ' || coalesce(snippet, '')) gin_trgm_ops);

-- ─── candidate_email_links ────────────────────────────────────────────────────
-- Links a matched email_message to a candidate.
-- match_confidence is a 0.000–1.000 score; status drives the review inbox.
-- RLS isolation is via email_messages (message_id is always indexed).

CREATE TABLE candidate_email_links (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id      UUID           NOT NULL REFERENCES candidates(id)     ON DELETE CASCADE,
  message_id        UUID           NOT NULL REFERENCES email_messages(id)  ON DELETE CASCADE,
  match_strategy    match_strategy NOT NULL,
  match_confidence  NUMERIC(4,3)   NOT NULL CHECK (match_confidence BETWEEN 0 AND 1),
  matched_address   CITEXT,
  status            match_status   NOT NULL DEFAULT 'active',
  reviewed_by       UUID           REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX candidate_email_links_candidate_id_idx ON candidate_email_links(candidate_id);
CREATE INDEX candidate_email_links_message_id_idx   ON candidate_email_links(message_id);
CREATE INDEX candidate_email_links_status_idx       ON candidate_email_links(status);

-- ─── sync_events ──────────────────────────────────────────────────────────────
-- Append-only observability log. Written by the sync worker after every
-- backfill page, delta poll, or webhook delivery. Never updated or deleted.

CREATE TABLE sync_events (
  id                  BIGSERIAL      PRIMARY KEY,
  user_id             UUID           NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  agency_id           UUID           NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider            email_provider NOT NULL,
  event_type          TEXT           NOT NULL,                     -- 'backfill_page', 'delta_poll', 'webhook', etc.
  cursor_before       TEXT,
  cursor_after        TEXT,
  messages_processed  INT            NOT NULL DEFAULT 0,
  matches_created     INT            NOT NULL DEFAULT 0,
  error_code          TEXT,
  error_body          JSONB,
  occurred_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX sync_events_user_occurred_at_idx ON sync_events(user_id, occurred_at DESC);
CREATE INDEX sync_events_agency_id_idx        ON sync_events(agency_id);

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- Pattern: current_agency_id() — matches all existing RLS policies in this DB.
-- Service-role key bypasses RLS for server-side sync workers.

ALTER TABLE provider_connections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ikhaya_tenant_ms_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_email_links    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_events              ENABLE ROW LEVEL SECURITY;

-- ── provider_connections ──────────────────────────────────────────────────────

CREATE POLICY provider_connections_select ON provider_connections
  FOR SELECT USING (agency_id = current_agency_id());

CREATE POLICY provider_connections_insert ON provider_connections
  FOR INSERT WITH CHECK (agency_id = current_agency_id());

CREATE POLICY provider_connections_update ON provider_connections
  FOR UPDATE USING (agency_id = current_agency_id());

CREATE POLICY provider_connections_delete ON provider_connections
  FOR DELETE USING (agency_id = current_agency_id());

-- ── ikhaya_tenant_ms_tenants ──────────────────────────────────────────────────

CREATE POLICY ikhaya_tenant_ms_tenants_select ON ikhaya_tenant_ms_tenants
  FOR SELECT USING (ikhaya_agency_id = current_agency_id());

CREATE POLICY ikhaya_tenant_ms_tenants_insert ON ikhaya_tenant_ms_tenants
  FOR INSERT WITH CHECK (ikhaya_agency_id = current_agency_id());

CREATE POLICY ikhaya_tenant_ms_tenants_update ON ikhaya_tenant_ms_tenants
  FOR UPDATE USING (ikhaya_agency_id = current_agency_id());

CREATE POLICY ikhaya_tenant_ms_tenants_delete ON ikhaya_tenant_ms_tenants
  FOR DELETE USING (ikhaya_agency_id = current_agency_id());

-- ── email_threads ─────────────────────────────────────────────────────────────

CREATE POLICY email_threads_select ON email_threads
  FOR SELECT USING (agency_id = current_agency_id());

CREATE POLICY email_threads_insert ON email_threads
  FOR INSERT WITH CHECK (agency_id = current_agency_id());

CREATE POLICY email_threads_update ON email_threads
  FOR UPDATE USING (agency_id = current_agency_id());

CREATE POLICY email_threads_delete ON email_threads
  FOR DELETE USING (agency_id = current_agency_id());

-- ── email_messages ────────────────────────────────────────────────────────────

CREATE POLICY email_messages_select ON email_messages
  FOR SELECT USING (agency_id = current_agency_id());

CREATE POLICY email_messages_insert ON email_messages
  FOR INSERT WITH CHECK (agency_id = current_agency_id());

CREATE POLICY email_messages_update ON email_messages
  FOR UPDATE USING (agency_id = current_agency_id());

CREATE POLICY email_messages_delete ON email_messages
  FOR DELETE USING (agency_id = current_agency_id());

-- ── candidate_email_links ─────────────────────────────────────────────────────
-- No direct agency_id column; isolation joins through email_messages.
-- message_id is indexed so the EXISTS subquery is efficient.

CREATE POLICY candidate_email_links_select ON candidate_email_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM email_messages em
      WHERE em.id = message_id
        AND em.agency_id = current_agency_id()
    )
  );

CREATE POLICY candidate_email_links_insert ON candidate_email_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM email_messages em
      WHERE em.id = message_id
        AND em.agency_id = current_agency_id()
    )
  );

CREATE POLICY candidate_email_links_update ON candidate_email_links
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM email_messages em
      WHERE em.id = message_id
        AND em.agency_id = current_agency_id()
    )
  );

CREATE POLICY candidate_email_links_delete ON candidate_email_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM email_messages em
      WHERE em.id = message_id
        AND em.agency_id = current_agency_id()
    )
  );

-- ── sync_events ───────────────────────────────────────────────────────────────
-- Append-only: SELECT + INSERT only. No UPDATE or DELETE policies.

CREATE POLICY sync_events_select ON sync_events
  FOR SELECT USING (agency_id = current_agency_id());

CREATE POLICY sync_events_insert ON sync_events
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
